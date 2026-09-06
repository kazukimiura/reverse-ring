/**
 * 序盤離脱対策 対策2・3 — 導入壁・ウォームアップ壁のスケジュール表。
 * GDD「対策2・3: 導入壁の仕様」「対策3（続き）: 2回目以降のウォームアップ」章。
 *
 * 導入壁・ウォームアップ壁は常にパターン P01（`n_diff` を進めない。`n_disp` のみ+1）。
 */

/** 1枚の助走壁（導入・ウォームアップ）の生成パラメータ */
export interface WarmupWallSpec {
  /** 切れ目の角幅 [rad]（gapAngleRatio・助走上乗せbは掛けない生の値） */
  thetaGap: number;
  /** 壁の接近速度 [R/秒] */
  vW: number;
  /** 次の壁までの到達イベント間隔 [秒] */
  arrivalIntervalSec: number;
  /** true の場合、切れ目中心は自機の現在角度に追従する（物理的に被弾不能） */
  followsShip: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 初回プレイの導入壁12枚（index 0〜11）を生成する。
 * 1〜6枚目: θ_gap=π・自機追従（被弾不能）。7〜12枚目: θ_gap 2.60→1.80 rad へ線形に縮小。
 */
export function buildIntroWallSpecs(): WarmupWallSpec[] {
  const specs: WarmupWallSpec[] = [];
  for (let i = 0; i < 6; i++) {
    specs.push({ thetaGap: Math.PI, vW: 0.4, arrivalIntervalSec: 2.8, followsShip: true });
  }
  for (let i = 0; i < 6; i++) {
    const t = i / 5; // 0 → 1（6枚で線形補間）
    specs.push({
      thetaGap: lerp(2.6, 1.8, t),
      vW: lerp(0.45, 0.53, t),
      arrivalIntervalSec: lerp(2.7, 2.5, t),
      followsShip: false,
    });
  }
  return specs;
}

export interface WarmupScheduleRow {
  minPlay: number;
  maxPlay: number | null;
  count: number;
  thetaGapAdd: number;
  arrivalMultiplier: number;
  vWMultiplier: number;
}

/** 2回目以降のウォームアップ枚数逓減表（GDD「対策3（続き）」） */
export const WARMUP_SCHEDULE: readonly WarmupScheduleRow[] = [
  { minPlay: 2, maxPlay: 3, count: 8, thetaGapAdd: 0.55, arrivalMultiplier: 1.3, vWMultiplier: 0.8 },
  { minPlay: 4, maxPlay: 6, count: 5, thetaGapAdd: 0.4, arrivalMultiplier: 1.2, vWMultiplier: 0.85 },
  { minPlay: 7, maxPlay: 10, count: 3, thetaGapAdd: 0.3, arrivalMultiplier: 1.15, vWMultiplier: 0.9 },
  { minPlay: 11, maxPlay: null, count: 3, thetaGapAdd: 0.3, arrivalMultiplier: 1.15, vWMultiplier: 0.9 },
] as const;

export function warmupRowForPlayCount(totalPlayCount: number): WarmupScheduleRow {
  const row = WARMUP_SCHEDULE.find(
    (r) => totalPlayCount >= r.minPlay && (r.maxPlay === null || totalPlayCount <= r.maxPlay)
  );
  return row ?? WARMUP_SCHEDULE[WARMUP_SCHEDULE.length - 1];
}

/**
 * 2回目以降のウォームアップ壁を生成する（n_diff=0 の基準値に対して行のadd/multiplierを適用）。
 * 末尾2枚は上乗せ量を線形に0へ戻す（段差を作らない）。
 * `baseGap0` / `baseVw0` / `baseA0` は n_diff=0 での基準値（呼び出し側が difficultyCurve から渡す）。
 */
export function buildWarmupWallSpecs(
  row: WarmupScheduleRow,
  baseGap0: number,
  baseVw0: number,
  baseA0: number
): WarmupWallSpec[] {
  const specs: WarmupWallSpec[] = [];
  for (let i = 0; i < row.count; i++) {
    // 末尾2枚で上乗せ量を線形に0へ戻す
    const remaining = row.count - 1 - i;
    const taperFactor = remaining >= 2 ? 1 : remaining / 2;
    specs.push({
      thetaGap: baseGap0 + row.thetaGapAdd * taperFactor,
      vW: baseVw0 * row.vWMultiplier,
      arrivalIntervalSec: baseA0 * row.arrivalMultiplier,
      followsShip: false,
    });
  }
  return specs;
}
