/**
 * セーブデータ構造 — GDD「セーブデータ構造（JSON）」章の実装。
 *
 * localStorage に単一キーで保存する。セッション単位のカウンタ（広告頻度制御）のみ
 * sessionStorage に分離する（GDD v1.1・R11）。
 *
 * ロード時のバリデーション（GDD「ロード時のバリデーション」表）を必ず通す。
 * localStorage が使えない環境（プライベートブラウズ等）でも、全機能をメモリ上の
 * デフォルト値で動作させ、保存できないことを理由にゲームが起動しない状態を作らない。
 */

export const SAVE_KEY = "reversering.save.v1";
export const SESSION_KEY = "reversering.session";
export const SAVE_VERSION = "1.2.0";

export interface SaveDataMeta {
  version: string;
  savedAt: string;
  totalPlayCount: number;
}

export interface SaveDataBest {
  walls: number;
  score: number;
  achievedAt: string | null;
}

export interface SaveDataProgress {
  highestZoneReached: number;
  seenZones: number[];
  // NOTE: 書き込みのみで、現状はどのゲームロジックからも読み出していない
  // （パターン抽選 `wallPatterns.ts` の `patternsUnlockedAt` は毎ラン n_diff のみで判定する）。
  // 将来の「図鑑」的な機能（解放済みパターン一覧の表示等）を見越した先行フィールドとして
  // 意図的に残す。読み出し先を実装しない場合は次回改修時に削除を検討すること。
  unlockedPatterns: string[];
  seenPatterns: string[];
}

export interface SaveDataOnboarding {
  introStarted: boolean;
  introCompleted: boolean;
  countdownShownCount: number;
}

export interface SaveDataAssist {
  active: boolean;
  recentRunWalls: [number, number, number, number, number];
  consecutiveLowRuns: number;
  activatedAtAvgWalls: number;
  runsSinceActivation: number;
  activatedCount: number;
}

export interface SaveDataStatistics {
  totalWallsPassed: number;
  totalNearMisses: number;
  totalReversals: number;
  totalPlayTimeSec: number;
  longestRunSec: number;
  deathsByPattern: Record<string, number>;
  deathsByWallIndexBucket: Record<string, number>;
  continueUsedCount: number;
  assistedRunCount: number;
}

export interface SaveDataDaily {
  seedDate: string | null;
  seedBestWalls: number;
  seedBestScore: number;
}

export interface SaveDataSettings {
  sound: boolean;
  vibration: boolean;
  reducedMotion: boolean;
}

export interface SaveData {
  meta: SaveDataMeta;
  best: SaveDataBest;
  progress: SaveDataProgress;
  onboarding: SaveDataOnboarding;
  assist: SaveDataAssist;
  statistics: SaveDataStatistics;
  daily: SaveDataDaily;
  settings: SaveDataSettings;
}

export interface SessionAdState {
  startedAt: string;
  interstitialsShown: number;
  playsSinceLastInterstitial: number;
  lastInterstitialAt: string | null;
  pendingInterstitial: boolean;
}

const KNOWN_PATTERN_IDS = ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10"];
const KNOWN_ZONE_IDS = [1, 2, 3, 4, 5, 6, 7];

export function buildDefaultSaveData(): SaveData {
  return {
    meta: { version: SAVE_VERSION, savedAt: new Date(0).toISOString(), totalPlayCount: 0 },
    best: { walls: 0, score: 0, achievedAt: null },
    progress: {
      highestZoneReached: 1,
      seenZones: [1],
      unlockedPatterns: ["P01"],
      seenPatterns: ["P01"],
    },
    onboarding: { introStarted: false, introCompleted: false, countdownShownCount: 0 },
    assist: {
      active: false,
      recentRunWalls: [0, 0, 0, 0, 0],
      consecutiveLowRuns: 0,
      activatedAtAvgWalls: 0,
      runsSinceActivation: 0,
      activatedCount: 0,
    },
    statistics: {
      totalWallsPassed: 0,
      totalNearMisses: 0,
      totalReversals: 0,
      totalPlayTimeSec: 0,
      longestRunSec: 0,
      deathsByPattern: {},
      deathsByWallIndexBucket: {},
      continueUsedCount: 0,
      assistedRunCount: 0,
    },
    daily: { seedDate: null, seedBestWalls: 0, seedBestScore: 0 },
    settings: { sound: true, vibration: true, reducedMotion: false },
  };
}

export function buildDefaultSessionAdState(): SessionAdState {
  return {
    startedAt: new Date().toISOString(),
    interstitialsShown: 0,
    playsSinceLastInterstitial: 0,
    lastInterstitialAt: null,
    pendingInterstitial: false,
  };
}

// ─── バリデーション用ヘルパー ────────────────────────────────────────

function safeNumber(v: unknown, fallback: number, minZero = true): number {
  if (typeof v !== "number" || Number.isNaN(v) || !Number.isFinite(v)) return fallback;
  return minZero ? Math.max(0, v) : v;
}

function safeBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function safeString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function safeStringArrayFiltered(v: unknown, known: string[], fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const filtered = v.filter((x): x is string => typeof x === "string" && known.includes(x));
  return filtered.length > 0 ? Array.from(new Set(filtered)) : fallback;
}

function safeNumberArrayFiltered(v: unknown, known: number[], fallback: number[]): number[] {
  if (!Array.isArray(v)) return fallback;
  const filtered = v.filter((x): x is number => typeof x === "number" && known.includes(x));
  return filtered.length > 0 ? Array.from(new Set(filtered)) : fallback;
}

function safeRecordOfNumbers(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "number" && Number.isFinite(val)) out[k] = Math.max(0, val);
  }
  return out;
}

function safeRecentRunWalls(v: unknown): [number, number, number, number, number] {
  if (!Array.isArray(v) || v.length !== 5 || !v.every((x) => typeof x === "number" && Number.isFinite(x))) {
    return [0, 0, 0, 0, 0];
  }
  return v.map((x) => Math.max(0, x)) as [number, number, number, number, number];
}

/**
 * 不完全・不正な保存データを、既知のデフォルト値で補完しながら安全な `SaveData` に正規化する。
 * `JSON.parse` 自体が失敗した場合は呼び出し側で捕捉し、この関数には渡さず
 * `buildDefaultSaveData()` を直接使うこと。
 */
export function normalizeSaveData(parsed: unknown): SaveData {
  const base = buildDefaultSaveData();
  if (!parsed || typeof parsed !== "object") return base;
  const p = parsed as Partial<Record<keyof SaveData, unknown>>;

  const meta = (p.meta ?? {}) as Partial<SaveDataMeta>;
  const best = (p.best ?? {}) as Partial<SaveDataBest>;
  const progress = (p.progress ?? {}) as Partial<SaveDataProgress>;
  const onboarding = (p.onboarding ?? {}) as Partial<SaveDataOnboarding>;
  const assist = (p.assist ?? {}) as Partial<SaveDataAssist>;
  const statistics = (p.statistics ?? {}) as Partial<SaveDataStatistics>;
  const daily = (p.daily ?? {}) as Partial<SaveDataDaily>;
  const settings = (p.settings ?? {}) as Partial<SaveDataSettings>;

  return {
    meta: {
      version: SAVE_VERSION,
      savedAt: safeString(meta.savedAt, base.meta.savedAt),
      totalPlayCount: safeNumber(meta.totalPlayCount, base.meta.totalPlayCount),
    },
    best: {
      walls: safeNumber(best.walls, base.best.walls),
      score: safeNumber(best.score, base.best.score),
      achievedAt: typeof best.achievedAt === "string" ? best.achievedAt : null,
    },
    progress: {
      highestZoneReached: Math.max(1, safeNumber(progress.highestZoneReached, 1)),
      seenZones: safeNumberArrayFiltered(progress.seenZones, KNOWN_ZONE_IDS, base.progress.seenZones),
      unlockedPatterns: safeStringArrayFiltered(
        progress.unlockedPatterns,
        KNOWN_PATTERN_IDS,
        base.progress.unlockedPatterns
      ),
      seenPatterns: safeStringArrayFiltered(
        progress.seenPatterns,
        KNOWN_PATTERN_IDS,
        base.progress.seenPatterns
      ),
    },
    onboarding: {
      introStarted: safeBool(onboarding.introStarted, base.onboarding.introStarted),
      introCompleted: safeBool(onboarding.introCompleted, base.onboarding.introCompleted),
      countdownShownCount: safeNumber(onboarding.countdownShownCount, 0),
    },
    assist: {
      active: safeBool(assist.active, base.assist.active),
      recentRunWalls: safeRecentRunWalls(assist.recentRunWalls),
      consecutiveLowRuns: safeNumber(assist.consecutiveLowRuns, 0),
      activatedAtAvgWalls: safeNumber(assist.activatedAtAvgWalls, 0),
      runsSinceActivation: safeNumber(assist.runsSinceActivation, 0),
      activatedCount: safeNumber(assist.activatedCount, 0),
    },
    statistics: {
      totalWallsPassed: safeNumber(statistics.totalWallsPassed, 0),
      totalNearMisses: safeNumber(statistics.totalNearMisses, 0),
      totalReversals: safeNumber(statistics.totalReversals, 0),
      totalPlayTimeSec: safeNumber(statistics.totalPlayTimeSec, 0),
      longestRunSec: safeNumber(statistics.longestRunSec, 0),
      deathsByPattern: safeRecordOfNumbers(statistics.deathsByPattern),
      deathsByWallIndexBucket: safeRecordOfNumbers(statistics.deathsByWallIndexBucket),
      continueUsedCount: safeNumber(statistics.continueUsedCount, 0),
      assistedRunCount: safeNumber(statistics.assistedRunCount, 0),
    },
    daily: {
      seedDate: typeof daily.seedDate === "string" ? daily.seedDate : null,
      seedBestWalls: safeNumber(daily.seedBestWalls, 0),
      seedBestScore: safeNumber(daily.seedBestScore, 0),
    },
    settings: {
      sound: safeBool(settings.sound, true),
      vibration: safeBool(settings.vibration, true),
      reducedMotion: safeBool(settings.reducedMotion, false),
    },
  };
}

export function readPersistedSaveData(): SaveData {
  if (typeof window === "undefined") return buildDefaultSaveData();
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return buildDefaultSaveData();
    const parsed: unknown = JSON.parse(raw);
    return normalizeSaveData(parsed);
  } catch {
    // JSON.parse 失敗、あるいは localStorage が使用不可 → 完全なデフォルト値で起動する
    return buildDefaultSaveData();
  }
}

export function persistSaveData(data: SaveData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // プライベートブラウズ等で保存できない場合は無視する（ゲームは継続動作させる）
  }
}

export function readSessionAdState(): SessionAdState {
  if (typeof window === "undefined") return buildDefaultSessionAdState();
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return buildDefaultSessionAdState();
    const parsed = JSON.parse(raw) as Partial<SessionAdState>;
    const base = buildDefaultSessionAdState();
    return {
      startedAt: safeString(parsed.startedAt, base.startedAt),
      interstitialsShown: safeNumber(parsed.interstitialsShown, 0),
      playsSinceLastInterstitial: safeNumber(parsed.playsSinceLastInterstitial, 0),
      lastInterstitialAt: typeof parsed.lastInterstitialAt === "string" ? parsed.lastInterstitialAt : null,
      pendingInterstitial: safeBool(parsed.pendingInterstitial, false),
    };
  } catch {
    return buildDefaultSessionAdState();
  }
}

export function persistSessionAdState(data: SessionAdState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    // 無視する
  }
}
