/**
 * 当たり判定 — GDD「座標系・単位系と当たり判定」章の「当たり判定の成立条件（極座標）」。
 *
 * 判定は壁の半径がRを跨いだ瞬間に1回だけ行う。フレーム終端の位置だけで判定せず、
 * 半径の跨ぎを検出して線形補間で交差時刻 t* を求め、その時刻の自機角度・切れ目中心角で
 * 判定する（GDD技術的留意事項2。トンネリング対策として必須）。
 */
import { absAngleDiff, normalizeAngle } from "./angleMath";
import { RING_RADIUS, SHIP_HIT_RADIUS, NEAR_MISS_THRESHOLD_RATIO } from "./constants";
import { tolerance } from "./difficultyCurve";
import { gapCenterAt, wallRadiusAt, type ActiveWall } from "./wallEngine";

export interface CrossingCheckInput {
  wall: ActiveWall;
  prevTimeSec: number;
  nowTimeSec: number;
  /** t* 時点の自機角度を求めるための、前フレーム時点の自機角度・向き・角速度 */
  prevShipAngle: number;
  shipDir: 1 | -1;
  omegaP: number;
  /** followsShip壁の場合、t*時点の自機角度をそのまま切れ目中心として使う */
  shipAngleAtCrossForFollow?: number;
}

export interface CrossingResult {
  crossed: boolean;
  tStarSec?: number;
  passed?: boolean;
  isNearMiss?: boolean;
  margin?: number;
  tau?: number;
  angleDiffAtCross?: number;
  gapIndex?: number;
  /** t* 時点の自機角度 */
  shipAngleAtCross?: number;
  /** t* 時点の、最も近い切れ目の中心角（死亡演出・コンティニュー復帰位置に使う） */
  gapCenterAtCross?: number;
}

const NOT_CROSSED: CrossingResult = { crossed: false };

export function checkWallCrossing(input: CrossingCheckInput): CrossingResult {
  const { wall } = input;
  const prevRadius = wallRadiusAt(wall, input.prevTimeSec);
  const nowRadius = wallRadiusAt(wall, input.nowTimeSec);

  if (!(prevRadius > RING_RADIUS && nowRadius <= RING_RADIUS)) {
    return NOT_CROSSED;
  }

  const dt = input.nowTimeSec - input.prevTimeSec;
  const alpha = dt === 0 ? 0 : (prevRadius - RING_RADIUS) / (prevRadius - nowRadius);
  const tStarSec = input.prevTimeSec + alpha * dt;

  const shipAngleAtCross = normalizeAngle(
    input.prevShipAngle + input.shipDir * input.omegaP * alpha * dt
  );

  const gapCount = wall.gapCentersAtSpawn.length;
  let bestD = Number.POSITIVE_INFINITY;
  let bestIndex = 0;
  let bestCenter = shipAngleAtCross;
  for (let i = 0; i < gapCount; i++) {
    const centerAtCross = wall.followsShip ? shipAngleAtCross : gapCenterAt(wall, i, tStarSec);
    const d = absAngleDiff(shipAngleAtCross, centerAtCross);
    if (d < bestD) {
      bestD = d;
      bestIndex = i;
      bestCenter = centerAtCross;
    }
  }

  const tau = tolerance(wall.thetaGapEff, SHIP_HIT_RADIUS);
  const passed = bestD <= tau;
  const margin = tau - bestD;
  const isNearMiss = passed && margin <= NEAR_MISS_THRESHOLD_RATIO * tau;

  return {
    crossed: true,
    tStarSec,
    passed,
    isNearMiss,
    margin,
    tau,
    angleDiffAtCross: bestD,
    gapIndex: bestIndex,
    shipAngleAtCross,
    gapCenterAtCross: bestCenter,
  };
}
