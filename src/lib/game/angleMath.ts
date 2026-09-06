/**
 * 角度計算のユーティリティ（GDD 技術的留意事項4）。
 *
 * 「角度は常に [0, 2π) に正規化し、角度差は [−π, π] に折り返す。
 *  この2つの関数を1箇所だけに定義し、全箇所でそれを使うこと」— GDDの明確な指示。
 * 各所で自前実装すると 0 と 2π の境界で必ずバグが出るため、本ファイル以外では
 * 正規化・角度差の計算を書かないこと。
 */

const TWO_PI = Math.PI * 2;

/** 角度を [0, 2π) の範囲へ正規化する */
export function normalizeAngle(angle: number): number {
  let a = angle % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

/** 角度差 (a − b) を [−π, π] に折り返して返す */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

/** 2つの角度の絶対差（[0, π]） */
export function absAngleDiff(a: number, b: number): number {
  return Math.abs(angleDiff(a, b));
}
