"use client";

/**
 * ReverseRing 公開ステートストア（Zustand）。
 *
 * UI（GameCanvas・オーバーレイ各種）はこの State / Actions のみに依存する契約とする。
 * ゲームロジックの実体は `src/lib/game/*.ts`（純粋関数群）に委譲し、このストアは
 * 「呼び出し順序・状態遷移・セーブデータ管理・入力キュー」に専念する。
 *
 * 準拠資料:
 * - shared/structure/ReverseRing_GDD.md（v1.2.0）
 * - shared/design/ReverseRing_ゲームスタイルガイド.md
 * - shared/qa/ReverseRing_GDD検証レポート.md（第3回検査・合格）
 *
 * 実行時のスケジューリング用ブックキーピング（乱数・保留中の壁生成情報）はUIの再描画に
 * 必要ないため、あえてzustandの外（モジュールスコープの可変変数）に置いている
 * （毎フレームのimmutable更新コストを避けるため）。UIが参照する必要がある値
 * （activeWalls・score・phase 等）のみをstateに反映する。
 */
import { create } from "zustand";
import { normalizeAngle } from "@/lib/game/angleMath";
import {
  DEATH_FREEZE_SEC,
  MAX_DT_SEC,
  MIN_VIEWPORT_PX,
  RING_RADIUS,
  WALL_SPAWN_RADIUS,
} from "@/lib/game/constants";
import {
  arrivalIntervalSec,
  baseGapAngle,
  shipAngularSpeed,
  wallApproachSpeed,
  assistBonusAngle,
} from "@/lib/game/difficultyCurve";
import {
  ActiveWall,
  GenerationContext,
  ScheduledArrival,
  buildActiveWall,
  scheduleLayer2,
  scheduleNextArrival,
} from "@/lib/game/wallEngine";
import { checkWallCrossing } from "@/lib/game/collision";
import { computeWallScore } from "@/lib/game/score";
import { zoneForNDisp, type ZoneDef } from "@/lib/game/zones";
import { Rng, randomSeed } from "@/lib/game/rng";
import {
  buildIntroWallSpecs,
  buildWarmupWallSpecs,
  warmupRowForPlayCount,
  type WarmupWallSpec,
} from "@/lib/game/warmupSchedule";
import { currentAssistB0, updateAssistStateAfterRun } from "@/lib/game/assist";
import {
  CONTINUE_BUFF_GAP_BONUS_RAD,
  CONTINUE_BUFF_WALL_COUNT,
  decideInterstitial,
} from "@/lib/game/adHooks";
import { pushWallOutcome } from "@/lib/game/sigmaLog";
import {
  buildDefaultSaveData,
  buildDefaultSessionAdState,
  persistSaveData,
  persistSessionAdState,
  readPersistedSaveData,
  readSessionAdState,
  type SaveData,
  type SessionAdState,
} from "@/lib/game/saveData";

// ─── フェーズ・公開型 ────────────────────────────────────────────────

export type GamePhase =
  | "boot"
  | "smallScreen"
  | "awaitFirstTap"
  | "countdown"
  | "playing"
  | "dead"
  | "result";

export interface LastRunResult {
  wallsPassed: number;
  score: number;
  zone: ZoneDef;
  isNewRecordWalls: boolean;
  isNewRecordScore: boolean;
  isFirstZoneVisit: boolean;
  wasAssisted: boolean;
  usedContinue: boolean;
  survivalSec: number;
}

export interface DeathInfo {
  shipAngle: number;
  gapCenterAngle: number;
  thetaGapEff: number;
  dir: 1 | -1;
}

export interface GameState {
  phase: GamePhase;
  saveData: SaveData;
  sessionAd: SessionAdState;

  // 実行中のラン状態（UI描画に必要な範囲のみ公開）
  shipAngle: number;
  shipDir: 1 | -1;
  nDiff: number;
  nDisp: number;
  score: number;
  gameClockSec: number;
  activeWalls: ActiveWall[];
  countdownRemainingSec: number;
  deathFreezeRemainingSec: number;
  deathInfo: DeathInfo | null;
  lastResult: LastRunResult | null;
  lastNearMiss: { atSec: number; wallUid: number; angle: number } | null;
  showInterstitialFlag: boolean;
  canContinue: boolean;

  tick(dtMsRaw: number): void;
  handlePointerDown(): void;
  retry(): void;
  continueRun(): void;
  returnToTitle(): void;
  checkViewport(minDimensionPx: number): void;
  acknowledgeInterstitialShown(): void;
  updateSettings(partial: Partial<SaveData["settings"]>): void;
}

// ─── モジュールスコープの実行時ブックキーピング（非公開） ───────────────────

interface PendingSpawn {
  scheduled: ScheduledArrival;
  spawnAtSec: number;
}

interface SchedulerRuntime {
  scriptedQueue: WarmupWallSpec[];
  lastArrivalCenterAngle: number;
  lastArrivalTimeSec: number;
  pending: PendingSpawn | null;
  pendingLayer2Source: ScheduledArrival | null;
  introRandomSeedConsumed: boolean;
}

function emptyScheduler(): SchedulerRuntime {
  return {
    scriptedQueue: [],
    lastArrivalCenterAngle: 0,
    lastArrivalTimeSec: 0,
    pending: null,
    pendingLayer2Source: null,
    introRandomSeedConsumed: false,
  };
}

let scheduler: SchedulerRuntime = emptyScheduler();
let nextWallUid = 1;
const rng = new Rng(randomSeed());

let pendingTapCount = 0;
let reversalsSinceLastWall = 0;
let nearMissesThisRun = 0;
let reversalsThisRun = 0;
let isIntroRun = false;
let introCompletedThisRun = false;
let firstRunAssistActive = false;
let continueBuffWallsRemaining = 0;
let continueUsedThisRun = false;
// 現在のランについて commitRun()（saveData確定・永続化）が既に呼ばれたかどうか。
// 死亡直後は prepareResult() のみが呼ばれ、実際にランが終了する（コンティニューを
// 使わず retry/returnToTitle が選ばれた、またはコンティニュー権を使い切って最終死亡した）
// 瞬間に一度だけ commitRun() を呼ぶためのガード。
let runCommitted = true;
let recentPatternIds: string[] = [];
let seenPatternIdsRuntime: Set<string> = new Set(["P01"]);

function flightDurationSec(vW: number): number {
  return (WALL_SPAWN_RADIUS - RING_RADIUS) / vW;
}

function nDispBucket(nDisp: number): string {
  if (nDisp < 10) return "0-9";
  if (nDisp < 30) return "10-29";
  if (nDisp < 60) return "30-59";
  if (nDisp < 100) return "60-99";
  if (nDisp < 140) return "100-139";
  if (nDisp < 180) return "140-179";
  return "180+";
}

/** 現在適用すべき角幅上乗せ b(n_diff) を合成する（初回助走 / 適応的緩和は排他的に一方のみ適用） */
function computeActiveAssistBonusRad(nDiff: number, saveData: SaveData): number {
  if (firstRunAssistActive) return assistBonusAngle(nDiff);
  if (saveData.assist.active) {
    const b0 = currentAssistB0(saveData.assist);
    return b0 > 0 ? assistBonusAngle(nDiff, b0) : 0;
  }
  return 0;
}

/** 次の到達イベントをスケジュールする（層2チェーン → 台本キュー → 通常カーブ抽選の優先順） */
function computeNextPending(nDiff: number, saveData: SaveData): PendingSpawn {
  if (scheduler.pendingLayer2Source) {
    const src = scheduler.pendingLayer2Source;
    scheduler.pendingLayer2Source = null;
    const scheduled = scheduleLayer2(
      src,
      scheduler.lastArrivalCenterAngle,
      scheduler.lastArrivalTimeSec,
      rng
    );
    const spawnAtSec = scheduled.arrivalAtSec - flightDurationSec(scheduled.vW);
    return { scheduled, spawnAtSec };
  }

  let scripted: WarmupWallSpec | null = null;
  if (scheduler.scriptedQueue.length > 0) {
    scripted = scheduler.scriptedQueue[0];
    scheduler.scriptedQueue = scheduler.scriptedQueue.slice(1);
  }

  const omegaP = shipAngularSpeed(nDiff);
  const assistBonusRad = computeActiveAssistBonusRad(nDiff, saveData);
  const continueBuffRad = continueBuffWallsRemaining > 0 ? CONTINUE_BUFF_GAP_BONUS_RAD : 0;

  const ctx: GenerationContext = {
    scripted: scripted
      ? {
          thetaGap: scripted.thetaGap,
          vW: scripted.vW,
          arrivalIntervalSec: scripted.arrivalIntervalSec,
          followsShip: scripted.followsShip,
        }
      : null,
    nDiff,
    omegaP,
    baseGapAngleRad: baseGapAngle(nDiff),
    arrivalIntervalSecNormal: arrivalIntervalSec(nDiff),
    vWNormal: wallApproachSpeed(nDiff),
    assistBonusRad,
    continueBuffRad,
    recentPatternIds,
    seenPatternIds: seenPatternIdsRuntime,
    rng,
  };

  // 導入壁: ランダム配置区間の最初の1枚（7枚目）は Δθ_max を固定0.40radにする特例
  let forcedDelta: number | undefined;
  if (isIntroRun && scripted && !scripted.followsShip && !scheduler.introRandomSeedConsumed) {
    forcedDelta = 0.4;
    scheduler.introRandomSeedConsumed = true;
  }

  const scheduled = scheduleNextArrival(
    scheduler.lastArrivalCenterAngle,
    scheduler.lastArrivalTimeSec,
    ctx,
    forcedDelta
  );
  if (continueBuffWallsRemaining > 0) continueBuffWallsRemaining -= 1;

  const spawnAtSec = scheduled.arrivalAtSec - flightDurationSec(scheduled.vW);
  return { scheduled, spawnAtSec };
}

function ensurePendingComputed(nDiff: number, saveData: SaveData): void {
  if (!scheduler.pending) {
    scheduler.pending = computeNextPending(nDiff, saveData);
  }
}

// ─── ストア本体 ───────────────────────────────────────────────────

export const useGameStore = create<GameState>((set, get) => {
  function persistSave(next: SaveData): void {
    set({ saveData: next });
    persistSaveData(next);
  }

  /** 新しいランを開始する（初回起動・「もう一度」共通）。コンティニューはこちらを使わない。 */
  function beginNewRun(): void {
    const state = get();
    const saveData = state.saveData;
    const totalPlayCount = saveData.meta.totalPlayCount + 1;

    scheduler = emptyScheduler();
    nextWallUid = 1;
    pendingTapCount = 0;
    reversalsSinceLastWall = 0;
    nearMissesThisRun = 0;
    reversalsThisRun = 0;
    continueBuffWallsRemaining = 0;
    continueUsedThisRun = false;
    runCommitted = false;
    recentPatternIds = [];
    seenPatternIdsRuntime = new Set(saveData.progress.seenPatterns);

    const useIntro = !saveData.onboarding.introCompleted;
    isIntroRun = useIntro;
    introCompletedThisRun = false;
    firstRunAssistActive = useIntro;

    if (useIntro) {
      scheduler.scriptedQueue = buildIntroWallSpecs();
    } else {
      const row = warmupRowForPlayCount(totalPlayCount);
      scheduler.scriptedQueue = buildWarmupWallSpecs(
        row,
        baseGapAngle(0),
        wallApproachSpeed(0),
        arrivalIntervalSec(0)
      );
    }

    const nextSaveData: SaveData = {
      ...saveData,
      meta: { ...saveData.meta, totalPlayCount },
      onboarding: useIntro
        ? { ...saveData.onboarding, introStarted: true }
        : saveData.onboarding,
    };

    const phase: GamePhase = useIntro
      ? "awaitFirstTap"
      : totalPlayCount <= 2
        ? "countdown"
        : "playing";

    set({
      phase,
      saveData: nextSaveData,
      shipAngle: 0,
      shipDir: 1,
      nDiff: 0,
      nDisp: 0,
      score: 0,
      gameClockSec: 0,
      activeWalls: [],
      countdownRemainingSec: 3,
      deathFreezeRemainingSec: 0,
      deathInfo: null,
      lastResult: null,
      lastNearMiss: null,
      canContinue: true,
    });
    persistSaveData(nextSaveData);
  }

  /**
   * 死亡演出（DEATH_FREEZE_SEC）経過時に呼ぶ、表示専用の結果計算。
   *
   * ここではまだ「このランがコンティニューされるかどうか」が確定していないため、
   * `saveData`（best・statistics・progress等）には一切書き込まない。
   * リザルト表示用の `lastResult` とインタースティシャル広告の表示判定・
   * `sessionAd` の更新のみを行う。
   *
   * saveDataの確定・永続化は `commitRun()` が担当し、実際にランが終了した
   * タイミングでのみ呼ばれる（コンティニュー中は呼ばれない）。
   */
  function prepareResult(): void {
    const state = get();
    const wallsPassed = state.nDisp;
    const wasAssisted = state.saveData.assist.active || firstRunAssistActive;
    const disqualified = wasAssisted || continueUsedThisRun;

    const saveData = state.saveData;
    const isNewRecordWalls = !disqualified && wallsPassed > saveData.best.walls;
    const isNewRecordScore = !disqualified && state.score > saveData.best.score;
    const zone = zoneForNDisp(wallsPassed);
    const isFirstZoneVisit = !saveData.progress.seenZones.includes(zone.id);

    const lastResult: LastRunResult = {
      wallsPassed,
      score: state.score,
      zone,
      isNewRecordWalls,
      isNewRecordScore,
      isFirstZoneVisit,
      wasAssisted,
      usedContinue: continueUsedThisRun,
      survivalSec: state.gameClockSec,
    };

    // 広告フック: リザルト画面遷移直後に1回だけ判定する（表示上の演出でありsaveDataの確定とは独立）
    const decision = decideInterstitial({
      session: state.sessionAd,
      totalPlayCount: state.saveData.meta.totalPlayCount,
      lastRunSurvivalSec: state.gameClockSec,
      now: new Date(),
    });

    set({
      phase: "result",
      lastResult,
      showInterstitialFlag: decision.shouldShow,
      sessionAd: decision.nextSession,
      // continueUsedThisRunが既にtrue（コンティニュー権を使い切った最終死亡）ならボタンを出さない
      canContinue: !continueUsedThisRun,
    });
    persistSessionAdState(decision.nextSession);
  }

  /**
   * ランを確定し、saveData（best・statistics・progress等）を永続化する。
   *
   * 呼び出しは必ず「このランに続きがなくなった瞬間」に一度だけ行うこと:
   * - コンティニューを使わず retry() / returnToTitle() が呼ばれた場合
   * - コンティニュー権を使い切った状態で最終死亡した場合（tick()内で自動的に呼ばれる）
   * `continueRun()` が呼ばれた場合は絶対に呼んではならない（ランが継続するため）。
   */
  function commitRun(): void {
    const state = get();
    const wallsPassed = state.nDisp;
    const wasAssisted = state.saveData.assist.active || firstRunAssistActive;
    const disqualified = wasAssisted || continueUsedThisRun;

    const saveData = state.saveData;
    const isNewRecordWalls = !disqualified && wallsPassed > saveData.best.walls;
    const isNewRecordScore = !disqualified && state.score > saveData.best.score;
    const now = new Date().toISOString();

    const zone = zoneForNDisp(wallsPassed);
    const isFirstZoneVisit = !saveData.progress.seenZones.includes(zone.id);
    const seenZones = isFirstZoneVisit
      ? [...saveData.progress.seenZones, zone.id]
      : saveData.progress.seenZones;

    const unlockedPatterns = Array.from(
      new Set([...saveData.progress.unlockedPatterns, ...recentPatternIds, ...seenPatternIdsRuntime])
    );
    const seenPatterns = Array.from(new Set([...saveData.progress.seenPatterns, ...seenPatternIdsRuntime]));

    const introCompleted = saveData.onboarding.introCompleted || introCompletedThisRun;

    const nextAssist = updateAssistStateAfterRun(saveData.assist, wallsPassed);

    const deathBucket = nDispBucket(wallsPassed);
    const deathPatternId = state.deathInfo ? recentPatternIds[0] ?? "P01" : "P01";

    const nextSaveData: SaveData = {
      ...saveData,
      meta: { ...saveData.meta, savedAt: now },
      best: disqualified
        ? saveData.best
        : {
            walls: Math.max(saveData.best.walls, wallsPassed),
            score: Math.max(saveData.best.score, state.score),
            achievedAt: isNewRecordWalls || isNewRecordScore ? now : saveData.best.achievedAt,
          },
      progress: {
        highestZoneReached: disqualified
          ? saveData.progress.highestZoneReached
          : Math.max(saveData.progress.highestZoneReached, zone.id),
        seenZones,
        unlockedPatterns,
        seenPatterns,
      },
      onboarding: {
        ...saveData.onboarding,
        introCompleted,
      },
      assist: nextAssist,
      statistics: {
        ...saveData.statistics,
        totalWallsPassed: saveData.statistics.totalWallsPassed + wallsPassed,
        totalNearMisses: saveData.statistics.totalNearMisses + nearMissesThisRun,
        totalReversals: saveData.statistics.totalReversals + reversalsThisRun,
        totalPlayTimeSec: saveData.statistics.totalPlayTimeSec + state.gameClockSec,
        longestRunSec: Math.max(saveData.statistics.longestRunSec, state.gameClockSec),
        deathsByPattern: {
          ...saveData.statistics.deathsByPattern,
          [deathPatternId]: (saveData.statistics.deathsByPattern[deathPatternId] ?? 0) + 1,
        },
        deathsByWallIndexBucket: {
          ...saveData.statistics.deathsByWallIndexBucket,
          [deathBucket]: (saveData.statistics.deathsByWallIndexBucket[deathBucket] ?? 0) + 1,
        },
        continueUsedCount: saveData.statistics.continueUsedCount + (continueUsedThisRun ? 1 : 0),
        assistedRunCount: saveData.statistics.assistedRunCount + (wasAssisted ? 1 : 0),
      },
    };

    set({ saveData: nextSaveData });
    persistSaveData(nextSaveData);
    runCommitted = true;
  }

  function handlePassed(wall: ActiveWall, result: NonNullable<ReturnType<typeof checkWallCrossing>>): void {
    const state = get();
    const nDisp = state.nDisp + 1;
    const nDiff = wall.isWarmupOrIntro ? state.nDiff : state.nDiff + 1;
    const scoreGain = computeWallScore({
      nDiff: wall.nDiffAtSpawn,
      isNearMiss: !!result.isNearMiss,
      isWarmupOrIntro: wall.isWarmupOrIntro,
    });

    if (!wall.isWarmupOrIntro) {
      recentPatternIds = [wall.patternId, ...recentPatternIds].slice(0, 2);
      seenPatternIdsRuntime.add(wall.patternId);
    }
    if (isIntroRun && nDisp >= 12) introCompletedThisRun = true;
    if (result.isNearMiss) nearMissesThisRun += 1;

    pushWallOutcome({
      nDiff: wall.nDiffAtSpawn,
      patternId: wall.patternId,
      tau: result.tau ?? 0,
      d: result.angleDiffAtCross ?? 0,
      hit: false,
      firstTapLatencySec: null,
      slackAtArrivalSec: null,
      reversalsForThisWall: reversalsSinceLastWall,
      tapTimingErrorSec: null,
    });
    reversalsSinceLastWall = 0;

    set({
      nDisp,
      nDiff,
      score: state.score + scoreGain,
      lastNearMiss: result.isNearMiss
        ? { atSec: state.gameClockSec, wallUid: wall.uid, angle: result.shipAngleAtCross ?? 0 }
        : state.lastNearMiss,
    });
  }

  function handleDeath(wall: ActiveWall, result: NonNullable<ReturnType<typeof checkWallCrossing>>, dir: 1 | -1): void {
    pushWallOutcome({
      nDiff: wall.nDiffAtSpawn,
      patternId: wall.patternId,
      tau: result.tau ?? 0,
      d: result.angleDiffAtCross ?? 0,
      hit: true,
      firstTapLatencySec: null,
      slackAtArrivalSec: null,
      reversalsForThisWall: reversalsSinceLastWall,
      tapTimingErrorSec: null,
    });
    reversalsSinceLastWall = 0;
    if (!wall.isWarmupOrIntro) recentPatternIds = [wall.patternId, ...recentPatternIds].slice(0, 2);

    set({
      phase: "dead",
      deathFreezeRemainingSec: DEATH_FREEZE_SEC,
      deathInfo: {
        shipAngle: result.shipAngleAtCross ?? 0,
        gapCenterAngle: result.gapCenterAtCross ?? 0,
        thetaGapEff: wall.thetaGapEff,
        dir,
      },
      activeWalls: [],
    });
  }

  return {
    phase: "boot",
    saveData: buildDefaultSaveData(),
    sessionAd: buildDefaultSessionAdState(),

    shipAngle: 0,
    shipDir: 1,
    nDiff: 0,
    nDisp: 0,
    score: 0,
    gameClockSec: 0,
    activeWalls: [],
    countdownRemainingSec: 3,
    deathFreezeRemainingSec: 0,
    deathInfo: null,
    lastResult: null,
    lastNearMiss: null,
    showInterstitialFlag: false,
    canContinue: true,

    tick(dtMsRaw: number) {
      const state = get();
      if (state.phase === "boot" || state.phase === "smallScreen" || state.phase === "result") return;

      const dt = Math.min(Math.max(dtMsRaw / 1000, 0), MAX_DT_SEC);

      if (state.phase === "countdown") {
        const remaining = state.countdownRemainingSec - dt;
        if (remaining <= 0) {
          set({ phase: "playing", countdownRemainingSec: 0 });
        } else {
          set({ countdownRemainingSec: remaining });
        }
        return;
      }

      if (state.phase === "dead") {
        const remaining = state.deathFreezeRemainingSec - dt;
        if (remaining <= 0) {
          prepareResult();
          if (continueUsedThisRun) {
            // コンティニュー権を既に使い切った状態での死亡 = このランに続きはない。
            // コンティニュー選択を待たず、この時点で確定・永続化する。
            commitRun();
          }
        } else {
          set({ deathFreezeRemainingSec: remaining });
        }
        return;
      }

      if (state.phase === "awaitFirstTap") {
        // 自機はゆっくり周回し続けるが、壁はまだ生成しない（初回タップ待ち）
        const omegaP0 = shipAngularSpeed(0);
        const nextAngle = normalizeAngle(state.shipAngle + state.shipDir * omegaP0 * dt);
        set({ shipAngle: nextAngle });
        return;
      }

      // ── phase === "playing" ──
      // 1. 入力キューを消費（発生順に反転を適用。偶数回なら実質無反転）
      let dir = state.shipDir;
      if (pendingTapCount > 0) {
        for (let i = 0; i < pendingTapCount; i++) dir = dir === 1 ? -1 : 1;
        reversalsThisRun += pendingTapCount;
        reversalsSinceLastWall += pendingTapCount;
        pendingTapCount = 0;
      }

      const omegaP = shipAngularSpeed(state.nDiff);
      const prevTime = state.gameClockSec;
      const nowTime = prevTime + dt;
      const prevShipAngle = state.shipAngle;
      const nextShipAngle = normalizeAngle(prevShipAngle + dir * omegaP * dt);

      // 2. 壁のスケジューリング・生成
      ensurePendingComputed(state.nDiff, state.saveData);
      const walls = [...state.activeWalls];
      let guard = 0;
      while (scheduler.pending && nowTime >= scheduler.pending.spawnAtSec && guard < 8) {
        guard += 1;
        const spawn = scheduler.pending;
        const scheduled = spawn.scheduled;
        const flight = flightDurationSec(scheduled.vW);
        const wall = buildActiveWall(nextWallUid++, scheduled, spawn.spawnAtSec, flight);
        walls.push(wall);

        scheduler.lastArrivalCenterAngle = scheduled.followsShip
          ? nextShipAngle
          : scheduled.gapCenters[0];
        scheduler.lastArrivalTimeSec = scheduled.arrivalAtSec;

        if (scheduled.layerTag === "layer1") {
          scheduler.pendingLayer2Source = scheduled;
        } else {
          scheduler.pendingLayer2Source = null;
        }
        scheduler.pending = null;
        scheduler.pending = computeNextPending(state.nDiff, state.saveData);
      }

      // 3. 通過判定（半径の跨ぎを検出して補間）
      const survivors: ActiveWall[] = [];
      let died = false;
      for (const wall of walls) {
        if (died) continue;
        const result = checkWallCrossing({
          wall,
          prevTimeSec: prevTime,
          nowTimeSec: nowTime,
          prevShipAngle,
          shipDir: dir,
          omegaP,
        });
        if (!result.crossed) {
          survivors.push(wall);
          continue;
        }
        if (result.passed) {
          handlePassed(wall, result);
        } else {
          handleDeath(wall, result, dir);
          died = true;
        }
      }

      if (died) return; // handleDeath が phase を "dead" にし、activeWalls を空にしている

      set({
        shipAngle: nextShipAngle,
        shipDir: dir,
        gameClockSec: nowTime,
        activeWalls: survivors,
      });
    },

    handlePointerDown() {
      const state = get();
      if (state.phase === "awaitFirstTap") {
        const nextOnboarding = { ...state.saveData.onboarding, introStarted: true };
        const nextSaveData = { ...state.saveData, onboarding: nextOnboarding };
        pendingTapCount += 1;
        persistSave(nextSaveData);
        set({ phase: "playing" });
        return;
      }
      if (state.phase === "playing") {
        pendingTapCount += 1;
      }
      // countdown・dead・result・boot・smallScreen 中の入力は破棄する
    },

    retry() {
      // コンティニューを使わずリタイアする場合、このランはまだ確定していないのでここで確定する
      // （コンティニュー権を使い切った最終死亡は既にtick()内で確定済みのためスキップされる）
      if (!runCommitted) commitRun();
      beginNewRun();
    },

    continueRun() {
      const state = get();
      if (state.phase !== "result" && state.phase !== "dead") return;
      if (!state.deathInfo || continueUsedThisRun) return;

      continueUsedThisRun = true;
      continueBuffWallsRemaining = CONTINUE_BUFF_WALL_COUNT;
      scheduler.lastArrivalCenterAngle = state.deathInfo.gapCenterAngle;
      scheduler.lastArrivalTimeSec = state.gameClockSec;
      scheduler.pending = null;
      scheduler.pendingLayer2Source = null;

      set({
        phase: "countdown",
        countdownRemainingSec: 3,
        shipAngle: state.deathInfo.gapCenterAngle,
        shipDir: state.deathInfo.dir,
        activeWalls: [],
        deathInfo: null,
        canContinue: false,
      });
    },

    returnToTitle() {
      // retry() と同じ理由で、未確定のランがあればここで確定する
      if (!runCommitted) commitRun();
      beginNewRun();
    },

    checkViewport(minDimensionPx: number) {
      const state = get();
      const tooSmall = minDimensionPx < MIN_VIEWPORT_PX;
      if (tooSmall) {
        if (state.phase !== "smallScreen") set({ phase: "smallScreen" });
        return;
      }
      if (state.phase === "smallScreen" || state.phase === "boot") {
        beginNewRun();
      }
    },

    acknowledgeInterstitialShown() {
      set({ showInterstitialFlag: false });
    },

    updateSettings(partial: Partial<SaveData["settings"]>) {
      const state = get();
      const nextSaveData: SaveData = {
        ...state.saveData,
        settings: { ...state.saveData.settings, ...partial },
      };
      persistSave(nextSaveData);
    },
  };
});

// ─── 起動時の自動ロード（ブラウザ環境でのみ。SSR時はデフォルト値のまま） ──────────
if (typeof window !== "undefined") {
  const saveData = readPersistedSaveData();
  const sessionAd = readSessionAdState();
  useGameStore.setState({ saveData, sessionAd });

  // 開発時のみ: 実機・Playwright等での自己検証用にストアをグローバル公開する（本番ビルドには影響しない）
  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __reverseRingStore?: typeof useGameStore }).__reverseRingStore =
      useGameStore;
  }
}
