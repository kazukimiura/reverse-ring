/**
 * 難易度カーブ — GDD「数値設計 — 難易度カーブ」「到達可能性制約 Δθ_max」章の実装。
 *
 * 駆動変数は経過時間ではなく通過壁数 `n_diff`（難易度インデックス）。
 * 関数形は漸近飽和型（指数飽和）: P(n) = P∞ + (P0 − P∞) · exp(−n/k)
 *
 * GDD 技術的留意事項11: 「難易度パラメータは設定オブジェクトに切り出す」ため、
 * 数値はすべて `DIFFICULTY_CONFIG` に集約し、ロジックへハードコードしない。
 */
import { MIN_GAP_SEPARATION_RAD } from "./constants";

export interface AsymptoticParam {
  /** n=0 での初期値 */
  p0: number;
  /** n→∞ での漸近値 */
  pInf: number;
  /** 時定数 */
  k: number;
}

export const DIFFICULTY_CONFIG = {
  /** 壁の接近速度 v_w [R/s] */
  vW: { p0: 0.55, pInf: 1.50, k: 40 } as AsymptoticParam,
  /** 到達イベント間隔 A [秒] */
  arrivalInterval: { p0: 2.40, pInf: 0.55, k: 35 } as AsymptoticParam,
  /** 自機の角速度 ω_p [rad/秒] */
  omegaP: { p0: 2.40, pInf: 4.20, k: 45 } as AsymptoticParam,
  /** 切れ目の基準角幅 θ_gap [rad]（第1段・基本カーブ） */
  gapAngle: { p0: 1.400, pInf: 0.420, k: 55 } as AsymptoticParam,

  /** Δθ_max の可動域利用率（25%の安全余裕を常に残す） */
  kappa: 0.75,
  /** 予測駆動の総遅延 t_pred = t_time(0.08) + t_input(0.06) [秒] */
  tPred: 0.14,

  /** エキスパート・テーパー: n_diff > taperStartNDiff で θ_gap に線形減算項を加える */
  taperStartNDiff: 160,
  taperSlopePerN: 0.00090,
  taperFloorRad: 0.28,

  /**
   * 序盤離脱対策・適応的緩和 共通の「減衰する角幅上乗せ」 b(n_diff) = b0 · exp(−n/kb)
   * 初回プレイの助走上乗せと、適応的難易度緩和の上乗せは同じ式を使う（GDDの設計方針）。
   */
  assistB0: 0.80,
  assistKb: 10,

  /** 2層パターンの層間遷移固定 ΔT（v1.2 で 0.40→0.52秒・N2対応） */
  layerTransitionDtSec: 0.52,

  /** 切れ目中心の最小離隔（rad）。Δθ_max のクランプ下限にも同値を使う（GDD記載どおり） */
  minGapSeparationRad: MIN_GAP_SEPARATION_RAD,
} as const;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function asymptotic(n: number, p: AsymptoticParam): number {
  return p.pInf + (p.p0 - p.pInf) * Math.exp(-n / p.k);
}

/** v_w(n_diff) — 壁の接近速度 [R/秒] */
export function wallApproachSpeed(nDiff: number): number {
  return asymptotic(Math.max(nDiff, 0), DIFFICULTY_CONFIG.vW);
}

/** A(n_diff) — 到達イベント間隔 [秒] */
export function arrivalIntervalSec(nDiff: number): number {
  return asymptotic(Math.max(nDiff, 0), DIFFICULTY_CONFIG.arrivalInterval);
}

/** ω_p(n_diff) — 自機の角速度 [rad/秒] */
export function shipAngularSpeed(nDiff: number): number {
  return asymptotic(Math.max(nDiff, 0), DIFFICULTY_CONFIG.omegaP);
}

/**
 * θ_gap(n_diff) — 切れ目の基準角幅 [rad]。
 * 第1段（基本カーブ）と第2段（エキスパート・テーパー、n_diff > 160）の合成。
 * 下限 0.28 rad（τ = 0.065 rad）でクランプする。
 */
export function baseGapAngle(nDiff: number): number {
  const n = Math.max(nDiff, 0);
  const stage1 = asymptotic(n, DIFFICULTY_CONFIG.gapAngle);
  const taperCut =
    DIFFICULTY_CONFIG.taperSlopePerN * Math.max(0, n - DIFFICULTY_CONFIG.taperStartNDiff);
  return Math.max(stage1 - taperCut, DIFFICULTY_CONFIG.taperFloorRad);
}

/**
 * b(n_diff) — 減衰する角幅上乗せ [rad]。
 * 初回プレイの助走上乗せ、および適応的難易度緩和の両方でこの式を共用する。
 * `b0` を省略すると初回プレイの標準値（0.80）を使う。適応的緩和では
 * 発動から30ラン経過後に半減した値（0.40）を `assist.ts` の `currentAssistB0` から受け取って渡す。
 */
export function assistBonusAngle(nDiff: number, b0: number = DIFFICULTY_CONFIG.assistB0): number {
  return b0 * Math.exp(-Math.max(nDiff, 0) / DIFFICULTY_CONFIG.assistKb);
}

/**
 * Δθ_max(遷移) = clamp( κ · ω_p(n_diff) · (ΔT − 2·t_pred), 0.30, π )
 *
 * 「通過時刻に切れ目中心が来る角度」に対して課す制約（GDD R2）。
 * omegaP は当該遷移を評価する n_diff での ω_p を渡すこと。
 */
export function maxReachableDelta(omegaP: number, transitionDtSec: number): number {
  const raw = DIFFICULTY_CONFIG.kappa * omegaP * (transitionDtSec - 2 * DIFFICULTY_CONFIG.tPred);
  return clamp(raw, DIFFICULTY_CONFIG.minGapSeparationRad, Math.PI);
}

/** 通常の壁間遷移の余裕 [秒]（数値表の「遷移の余裕」列と同じ式） */
export function transitionSlackSec(transitionDtSec: number): number {
  return 0.25 * transitionDtSec - 0.07;
}

/** τ(θ_gap_eff) — 通過の許容角。GDD: τ = θ_gap_eff/2 − r_p/R */
export function tolerance(thetaGapEff: number, shipHitRadius: number): number {
  return thetaGapEff / 2 - shipHitRadius;
}
