/**
 * 壁パターン一覧 — GDD「壁パターン一覧」章の実装（初期実装10種）。
 *
 * 「判定ロジックを1本に保つため、gaps・spin・layers の3軸のみを使う」という
 * GDDの方針に従い、パターンはデータ定義のみで表現する（判定ロジックの変更は不要）。
 */
import { Rng } from "./rng";

export interface WallPatternDef {
  id: string;
  name: string;
  /** 切れ目の数 */
  gaps: 1 | 2 | 3;
  /** 切れ目を等間隔に置くか、非対称に置くか */
  asymmetric: boolean;
  /** 壁自体の回転角速度の大きさ [rad/秒]。0 = 静止。符号は生成時にランダム化する */
  spin: number;
  /** 同時に飛来する層の数 */
  layers: 1 | 2;
  /** 解放される n_diff */
  unlockDiff: number;
  /** 狙い（設計意図。デバッグ表示用） */
  intent: string;
}

/** 初期実装パターン（10種）。GDD「壁パターン一覧」の表と完全一致させること。 */
export const WALL_PATTERNS: readonly WallPatternDef[] = [
  { id: "P01", name: "シングル", gaps: 1, asymmetric: false, spin: 0, layers: 1, unlockDiff: 0, intent: "基本形。導入・ウォームアップは常にこれ" },
  { id: "P02", name: "ワイドツイン", gaps: 2, asymmetric: false, spin: 0, layers: 1, unlockDiff: 8, intent: "「近い方を選ぶ」判断が初めて発生する" },
  { id: "P03", name: "スロースピン", gaps: 1, asymmetric: false, spin: 0.5, layers: 1, unlockDiff: 20, intent: "切れ目の未来位置を読む必要が生まれる" },
  { id: "P04", name: "オフセットツイン", gaps: 2, asymmetric: true, spin: 0, layers: 1, unlockDiff: 32, intent: "「真裏なのでどちらでも同じ」が成立しない" },
  { id: "P05", name: "ファストスピン", gaps: 1, asymmetric: false, spin: 1.1, layers: 1, unlockDiff: 45, intent: "自機と壁の回転方向の一致・不一致で難度が変わる" },
  { id: "P06", name: "ダブルレイヤー", gaps: 1, asymmetric: false, spin: 0, layers: 2, unlockDiff: 60, intent: "2層が0.52秒差で連続到達" },
  { id: "P07", name: "カウンタースピン", gaps: 1, asymmetric: false, spin: 0.9, layers: 2, unlockDiff: 80, intent: "2層が逆向きに回転。層間で移動方向が反転する" },
  { id: "P08", name: "トリプル", gaps: 3, asymmetric: true, spin: 0, layers: 1, unlockDiff: 100, intent: "選択肢が増えるほど最短を選ぶ判断に時間がかかる" },
  { id: "P09", name: "スピンツイン", gaps: 2, asymmetric: false, spin: 0.8, layers: 1, unlockDiff: 125, intent: "回転方向によって近い切れ目が入れ替わり続ける" },
  { id: "P10", name: "カウンターダブル", gaps: 2, asymmetric: true, spin: 1.2, layers: 2, unlockDiff: 150, intent: "P07とP09の複合。初期実装の最終形" },
] as const;

export const WALL_PATTERN_BY_ID: ReadonlyMap<string, WallPatternDef> = new Map(
  WALL_PATTERNS.map((p) => [p.id, p])
);

/**
 * gapAngleRatio = r_spin × r_gaps × r_layer
 *   r_spin  = min(1 + 0.20×|spin|, 1.30)
 *   r_gaps  = gaps ^ (−0.45)
 *   r_layer = 1.15（layers=2）／1.00（layers=1）
 */
export function computeGapAngleRatio(pattern: Pick<WallPatternDef, "spin" | "gaps" | "layers">): number {
  const rSpin = Math.min(1 + 0.2 * Math.abs(pattern.spin), 1.3);
  const rGaps = Math.pow(pattern.gaps, -0.45);
  const rLayer = pattern.layers === 2 ? 1.15 : 1.0;
  return rSpin * rGaps * rLayer;
}

export function patternsUnlockedAt(nDiff: number): WallPatternDef[] {
  return WALL_PATTERNS.filter((p) => p.unlockDiff <= nDiff);
}

export interface PatternSelectionInput {
  nDiff: number;
  /** 直近2枚のパターンid（連続禁止用。新しい順） */
  recentPatternIds: readonly string[];
  /** これまでに一度でも出したことのあるパターンid集合 */
  seenPatternIds: ReadonlySet<string>;
  rng: Rng;
}

export interface PatternSelectionResult {
  pattern: WallPatternDef;
  /** 「初見の保証」ルールにより強制的に選ばれたか */
  wasForcedFirstSight: boolean;
}

/**
 * パターン抽選ルール（GDD「パターン抽選ルール」表）。
 * - 初見の保証: 解放済みだが未出のパターンがあれば、解放n_diffが小さい順に確定で出す
 * - 重み配分: 直近解放されたパターンに25%、残りの解放済みで75%を等分
 * - 連続禁止: 直前2枚と同じidは出さない（解放済みが2種以下なら直前1枚のみ禁止）
 *
 * 助走区間（導入壁・ウォームアップ壁）は呼び出し側でP01を直接使うため、本関数は呼ばない。
 */
export function selectNextPattern(input: PatternSelectionInput): PatternSelectionResult {
  const unlocked = patternsUnlockedAt(input.nDiff);

  // 初見の保証: 解放済みだが未出のパターンを解放n_diffの昇順で探し、最初の1件を確定で出す
  const unseenUnlocked = unlocked
    .filter((p) => !input.seenPatternIds.has(p.id))
    .sort((a, b) => a.unlockDiff - b.unlockDiff);
  if (unseenUnlocked.length > 0) {
    return { pattern: unseenUnlocked[0], wasForcedFirstSight: true };
  }

  // 連続禁止フィルタ
  const banCount = unlocked.length <= 2 ? 1 : 2;
  const banned = new Set(input.recentPatternIds.slice(0, banCount));
  let candidates = unlocked.filter((p) => !banned.has(p.id));
  if (candidates.length === 0) {
    // 全滅した場合のフォールバック（解放数が極端に少ない場合のみ発生しうる）
    candidates = unlocked;
  }

  // 重み配分: 直近解放されたパターン(=unlockDiffが最大のもの)に25%、残りで75%を等分
  const mostRecentUnlockDiff = Math.max(...candidates.map((p) => p.unlockDiff));
  const mostRecent = candidates.filter((p) => p.unlockDiff === mostRecentUnlockDiff);
  const others = candidates.filter((p) => p.unlockDiff !== mostRecentUnlockDiff);

  const weighted: { pattern: WallPatternDef; weight: number }[] = [];
  if (others.length > 0) {
    const recentWeightEach = 0.25 / mostRecent.length;
    const otherWeightEach = 0.75 / others.length;
    mostRecent.forEach((p) => weighted.push({ pattern: p, weight: recentWeightEach }));
    others.forEach((p) => weighted.push({ pattern: p, weight: otherWeightEach }));
  } else {
    // 解放済みが1種類しかない（=常にP01のみ）場合は、それが100%
    mostRecent.forEach((p) => weighted.push({ pattern: p, weight: 1 / mostRecent.length }));
  }

  const total = weighted.reduce((s, w) => s + w.weight, 0);
  let r = input.rng.next() * total;
  for (const w of weighted) {
    r -= w.weight;
    if (r <= 0) return { pattern: w.pattern, wasForcedFirstSight: false };
  }
  return { pattern: weighted[weighted.length - 1].pattern, wasForcedFirstSight: false };
}
