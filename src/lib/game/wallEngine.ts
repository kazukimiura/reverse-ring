/**
 * 壁エンジン — GDD「壁の生成」「到達可能性制約 Δθ_max」「2層パターンの層間制約」章の実装。
 *
 * 設計方針: 壁は「生成時刻 spawnedAtSec・生成時半径 R_spawn・生成時中心角」の3値と
 * vW・spin が決まれば、以降は時刻 t の純関数として半径・中心角が定まる
 * （radius(t) = R_spawn − vW·(t−spawnedAtSec)、center(t) = centerAtSpawn + spin·(t−spawnedAtSec)）。
 * この関数化により、毎フレームの加算更新によるドリフトを避けている。
 *
 * 「到達イベントの列」モデル（GDD v1.1 R3）: 通常の壁間・2層パターンの層間のいずれも
 * 同じ Δθ_max 式を使い、遷移間隔 ΔT だけを差し替える。特別扱いのロジックを作らない。
 *
 * 【裁量で決めた箇所（GDDが明示しない実装細部）】
 * - 複数切れ目（gaps=2,3）の内部配置: GDDはgapAngleRatioの算出式のみを定義し、
 *   各切れ目の相互配置ルールまでは規定していない。対称パターンは等間隔、非対称パターンは
 *   均等割りに±20%のランダム揺らぎを与え、隣接切れ目間で最小離隔を確保する方式とした。
 * - 導入壁7枚目（ランダム配置区間の最初の1枚）: GDD「初期は±0.40 radから開始」の記述に従い、
 *   直前の自機角度を基準に±0.40 radで配置する特例とした（6枚目までは自機追従のため
 *   「直前の切れ目中心」という基準が存在しないための特例）。8〜12枚目は通常のΔθ_maxチェーンに戻す。
 */
import { normalizeAngle } from "./angleMath";
import { DIFFICULTY_CONFIG, maxReachableDelta } from "./difficultyCurve";
import type { Rng } from "./rng";
import { MIN_GAP_SEPARATION_RAD, WALL_SPAWN_RADIUS } from "./constants";
import {
  computeGapAngleRatio,
  selectNextPattern,
  WALL_PATTERN_BY_ID,
  type WallPatternDef,
} from "./wallPatterns";

export interface ActiveWall {
  uid: number;
  patternId: string;
  /** 生成時（spawnedAtSec時点）の各切れ目の中心角 */
  gapCentersAtSpawn: number[];
  /** 壁の回転角速度（符号付き）[rad/秒]。0=静止 */
  spin: number;
  /** 接近速度 [R/秒]（生成時に確定。飛行中は変化しない） */
  vW: number;
  /** 実効角幅（gapAngleRatio・助走上乗せ込みの最終値。飛行中は変化しない） */
  thetaGapEff: number;
  /** ゲーム内時刻（秒）。この時刻に半径がR_spawnだった */
  spawnedAtSec: number;
  nDiffAtSpawn: number;
  isWarmupOrIntro: boolean;
  /** 切れ目中心が自機の現在角度に追従するか（導入壁1〜6専用。物理的に被弾不能） */
  followsShip: boolean;
  layerTag?: "layer1" | "layer2";
}

/** 壁の現在半径（R単位） */
export function wallRadiusAt(wall: ActiveWall, tSec: number): number {
  return WALL_SPAWN_RADIUS - wall.vW * (tSec - wall.spawnedAtSec);
}

/** 切れ目 index の現在中心角（followsShip の壁は呼び出し側で自機角度に置き換えること） */
export function gapCenterAt(wall: ActiveWall, gapIndex: number, tSec: number): number {
  return normalizeAngle(wall.gapCentersAtSpawn[gapIndex] + wall.spin * (tSec - wall.spawnedAtSec));
}

// ─── 到達イベントのスケジューリング ──────────────────────────────────

/** 台本壁（導入・ウォームアップ）1枚分の生成パラメータ（warmupSchedule.tsのWarmupWallSpecを流用） */
export interface ScriptedSpawnSpec {
  thetaGap: number;
  vW: number;
  arrivalIntervalSec: number;
  followsShip: boolean;
}

export interface GenerationContext {
  /** 台本壁ならそのスペック。null なら通常カーブ＋パターン抽選を使う */
  scripted: ScriptedSpawnSpec | null;
  nDiff: number;
  omegaP: number;
  /** θ_gap(n_diff) の基準角幅（scriptedがnullのときのみ使用。difficultyCurve.baseGapAngleの結果） */
  baseGapAngleRad: number;
  /** A(n_diff)（scriptedがnullのときのみ使用） */
  arrivalIntervalSecNormal: number;
  /** v_w(n_diff)（scriptedがnullのときのみ使用） */
  vWNormal: number;
  /** 適用する角幅上乗せ [rad]（0のこともある。初回助走 or 適応的緩和） */
  assistBonusRad: number;
  /** コンティニュー直後バフ角幅 [rad]（0のこともある） */
  continueBuffRad: number;
  recentPatternIds: readonly string[];
  seenPatternIds: ReadonlySet<string>;
  rng: Rng;
}

export interface ScheduledArrival {
  patternId: string;
  pattern: WallPatternDef | null; // 台本壁はnull扱い（P01相当だが解放判定を通さない）
  spin: number;
  vW: number;
  thetaGapEff: number;
  gapCenters: number[];
  arrivalAtSec: number;
  spawnAtSec: number;
  nDiffAtSpawn: number;
  isWarmupOrIntro: boolean;
  followsShip: boolean;
  layers: 1 | 2;
  wasForcedFirstSight: boolean;
  /** この到達イベント評価に使ったω_p（層2スケジューリングの再利用のため保持） */
  omegaP: number;
  layerTag?: "layer1" | "layer2";
}

function placePrimaryCenter(
  prevCenter: number,
  deltaThetaMax: number,
  rng: Rng,
  minSep = MIN_GAP_SEPARATION_RAD
): number {
  if (deltaThetaMax <= minSep) {
    return normalizeAngle(prevCenter + rng.nextSign() * deltaThetaMax);
  }
  const magnitude = rng.nextBetween(minSep, deltaThetaMax);
  return normalizeAngle(prevCenter + rng.nextSign() * magnitude);
}

function placeAllGapCenters(primaryCenter: number, gapsCount: number, asymmetric: boolean, rng: Rng): number[] {
  if (gapsCount === 1) return [primaryCenter];
  const centers = [primaryCenter];
  const baseStep = (Math.PI * 2) / gapsCount;
  if (!asymmetric) {
    for (let i = 1; i < gapsCount; i++) centers.push(normalizeAngle(primaryCenter + baseStep * i));
    return centers;
  }
  let cursor = primaryCenter;
  for (let i = 1; i < gapsCount; i++) {
    const jitter = rng.nextBetween(-0.2, 0.2) * baseStep;
    const step = Math.max(baseStep + jitter, MIN_GAP_SEPARATION_RAD * 1.5);
    cursor = normalizeAngle(cursor + step);
    centers.push(cursor);
  }
  return centers;
}

/**
 * 直前の到達イベント（`prevArrivalCenter`・`prevArrivalTimeSec`）を基準に、次の到達イベントを
 * スケジュールする。台本壁（導入・ウォームアップ）か、通常カーブ＋パターン抽選かは
 * `ctx.scripted` の有無で分岐する。
 *
 * `forcedDeltaOverride` は導入壁7枚目（ランダム配置区間の最初の1枚）専用の特例で、
 * Δθ_max を式で計算せず固定0.40radを使う（GDD「初期は±0.40 radから開始」）。
 */
export function scheduleNextArrival(
  prevArrivalCenter: number,
  prevArrivalTimeSec: number,
  ctx: GenerationContext,
  forcedDeltaOverride?: number
): ScheduledArrival {
  const isScripted = ctx.scripted !== null;

  let pattern: WallPatternDef | null = null;
  let wasForcedFirstSight = false;
  let gaps = 1;
  let asymmetric = false;
  let spin = 0;
  let layers: 1 | 2 = 1;
  let gapAngleRatio = 1;

  if (!isScripted) {
    const selection = selectNextPattern({
      nDiff: ctx.nDiff,
      recentPatternIds: ctx.recentPatternIds,
      seenPatternIds: ctx.seenPatternIds,
      rng: ctx.rng,
    });
    pattern = selection.pattern;
    wasForcedFirstSight = selection.wasForcedFirstSight;
    gaps = pattern.gaps;
    asymmetric = pattern.asymmetric;
    spin = pattern.spin === 0 ? 0 : pattern.spin * ctx.rng.nextSign();
    layers = pattern.layers;
    gapAngleRatio = computeGapAngleRatio(pattern);
  }

  const vW = isScripted ? ctx.scripted!.vW : ctx.vWNormal;
  const arrivalIntervalSec = isScripted ? ctx.scripted!.arrivalIntervalSec : ctx.arrivalIntervalSecNormal;
  const baseGap = isScripted ? ctx.scripted!.thetaGap : ctx.baseGapAngleRad;
  const thetaGapEff = isScripted
    ? baseGap + ctx.continueBuffRad
    : baseGap * gapAngleRatio + ctx.assistBonusRad + ctx.continueBuffRad;

  const followsShip = isScripted ? ctx.scripted!.followsShip : false;

  const deltaThetaMax = forcedDeltaOverride ?? maxReachableDelta(ctx.omegaP, arrivalIntervalSec);
  const arrivalAtSec = prevArrivalTimeSec + arrivalIntervalSec;

  let gapCenters: number[];
  if (followsShip) {
    // 自機追従壁は中心角を確定させない（呼び出し側が毎フレーム自機角度で上書きする）
    gapCenters = [0];
  } else {
    const primary = placePrimaryCenter(prevArrivalCenter, deltaThetaMax, ctx.rng);
    gapCenters = placeAllGapCenters(primary, gaps, asymmetric, ctx.rng);
  }

  return {
    patternId: pattern?.id ?? "P01",
    pattern,
    spin: followsShip ? 0 : spin,
    vW,
    thetaGapEff,
    gapCenters,
    arrivalAtSec,
    spawnAtSec: NaN, // 呼び出し側でW(vW)を使って確定させる（vWがcallerから渡されるため）
    nDiffAtSpawn: ctx.nDiff,
    isWarmupOrIntro: isScripted,
    followsShip,
    layers,
    wasForcedFirstSight,
    omegaP: ctx.omegaP,
    layerTag: !isScripted && layers === 2 ? "layer1" : undefined,
  };
}

/**
 * 2層パターンの層2をスケジュールする。層1（`prevScheduled`）と同じパターン・vW・実効角幅を
 * 引き継ぎ、遷移間隔だけ層間固定値（0.52秒・v1.2）に差し替える。spinは層1と逆向き
 * （カウンタースピン。P06のようにspin=0のパターンでは0のまま）。
 */
export function scheduleLayer2(
  prevScheduled: ScheduledArrival,
  prevArrivalCenter: number,
  prevArrivalTimeSec: number,
  rng: Rng
): ScheduledArrival {
  const layerTransitionDtSec = DIFFICULTY_CONFIG.layerTransitionDtSec;
  const spin = prevScheduled.spin === 0 ? 0 : -prevScheduled.spin;
  const deltaThetaMax = maxReachableDelta(prevScheduled.omegaP, layerTransitionDtSec);
  const arrivalAtSec = prevArrivalTimeSec + layerTransitionDtSec;

  const gaps = prevScheduled.pattern?.gaps ?? 1;
  const asymmetric = prevScheduled.pattern?.asymmetric ?? false;
  const primary = placePrimaryCenter(prevArrivalCenter, deltaThetaMax, rng);
  const gapCenters = placeAllGapCenters(primary, gaps, asymmetric, rng);

  return {
    patternId: prevScheduled.patternId,
    pattern: prevScheduled.pattern,
    spin,
    vW: prevScheduled.vW,
    thetaGapEff: prevScheduled.thetaGapEff,
    gapCenters,
    arrivalAtSec,
    spawnAtSec: NaN,
    nDiffAtSpawn: prevScheduled.nDiffAtSpawn,
    isWarmupOrIntro: false,
    followsShip: false,
    layers: 2,
    wasForcedFirstSight: false,
    omegaP: prevScheduled.omegaP,
    layerTag: "layer2",
  };
}

/**
 * `ScheduledArrival` から実際に `ActiveWall` を組み立てる。
 * spawnAtSec は `arrivalAtSec − 飛行時間` として呼び出し側（store）が確定させてから渡すこと
 * （飛行時間 W = (R_spawn − R) / vW は difficultyCurve 側の定数計算に依存するため、
 * このモジュールでは定数を再定義せず引数で受け取る）。
 */
export function buildActiveWall(
  uid: number,
  scheduled: ScheduledArrival,
  spawnAtSec: number,
  flightDurationSec: number
): ActiveWall {
  const gapCentersAtSpawn = scheduled.followsShip
    ? [0]
    : scheduled.gapCenters.map((c) => normalizeAngle(c - scheduled.spin * flightDurationSec));

  return {
    uid,
    patternId: scheduled.patternId,
    gapCentersAtSpawn,
    spin: scheduled.spin,
    vW: scheduled.vW,
    thetaGapEff: scheduled.thetaGapEff,
    spawnedAtSec: spawnAtSec,
    nDiffAtSpawn: scheduled.nDiffAtSpawn,
    isWarmupOrIntro: scheduled.isWarmupOrIntro,
    followsShip: scheduled.followsShip,
    layerTag: scheduled.layerTag,
  };
}

export { WALL_PATTERN_BY_ID };
