/**
 * スコア計算 — GDD「スコア・リザルト設計」章（v1.1・C10対応）。
 *
 * w(i) = round( 100 × 1.400 / θ_gap(n_diff_i) × b_nm(i) )
 * θ_gap(n_diff) は難易度カーブの素の角幅（gapAngleRatio・助走上乗せbは掛けない）。
 * 助走区間（導入壁・ウォームアップ壁）は n_diff=0 相当として w=100 固定。
 */
import { SCORE_REFERENCE_GAP_ANGLE, NEAR_MISS_SCORE_MULTIPLIER, WARMUP_FIXED_SCORE } from "./constants";
import { baseGapAngle } from "./difficultyCurve";

export function computeWallScore(params: {
  nDiff: number;
  isNearMiss: boolean;
  isWarmupOrIntro: boolean;
}): number {
  if (params.isWarmupOrIntro) return WARMUP_FIXED_SCORE;
  const gap = baseGapAngle(params.nDiff);
  const multiplier = params.isNearMiss ? NEAR_MISS_SCORE_MULTIPLIER : 1.0;
  return Math.round((100 * SCORE_REFERENCE_GAP_ANGLE) / gap * multiplier);
}
