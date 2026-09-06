/**
 * 序盤離脱対策 対策5: 適応的難易度緩和（v1.2・N3対応 ヒステリシス付き）。
 * GDD「対策5: 適応的難易度緩和」章。
 *
 * 方式: `b_assist(n_diff) = 0.80 · exp(−n_diff/10)` の角幅上乗せ（difficultyCurve.assistBonusAngle と同じ式）。
 * - 発動条件: 直近5ラン平均 < 10枚 が3ラン連続
 * - 最低滞在ラン数（v1.2新設）: 発動から20ランは解除判定そのものを行わない
 * - 解除条件（21ラン目以降）: 直近5ラン平均が発動時点の直近5ラン平均の1.8倍に達したら解除
 * - 強制解除: 発動から30ランでb0を0.40へ半減、60ランで完全解除
 *
 * このモジュールは `SaveDataAssist` を入力に取り、次の状態を返す純粋関数として実装する
 * （ストア側が呼び出しタイミング・永続化を管理する）。
 */
import type { SaveDataAssist } from "./saveData";

export const ASSIST_ACTIVATION_AVG_THRESHOLD = 10;
export const ASSIST_ACTIVATION_CONSECUTIVE_LOW_RUNS = 3;
export const ASSIST_MIN_STAY_RUNS = 20;
export const ASSIST_RELATIVE_RELEASE_MULTIPLIER = 1.8;
export const ASSIST_HALVE_AT_RUNS = 30;
export const ASSIST_FORCE_RELEASE_AT_RUNS = 60;
export const ASSIST_B0_HALVED = 0.4;

function average(arr: readonly number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * 1ラン終了時に呼び出す。今回のランで通過した壁数（`n_disp`、助走区間を除く通常プレイ分）を渡し、
 * 更新後の `assist` 状態を返す。
 */
export function updateAssistStateAfterRun(
  current: SaveDataAssist,
  wallsPassedThisRun: number
): SaveDataAssist {
  const recentRunWalls: [number, number, number, number, number] = [
    current.recentRunWalls[1],
    current.recentRunWalls[2],
    current.recentRunWalls[3],
    current.recentRunWalls[4],
    wallsPassedThisRun,
  ];
  const avg5 = average(recentRunWalls);

  if (!current.active) {
    const consecutiveLowRuns =
      wallsPassedThisRun < ASSIST_ACTIVATION_AVG_THRESHOLD ? current.consecutiveLowRuns + 1 : 0;

    if (
      consecutiveLowRuns >= ASSIST_ACTIVATION_CONSECUTIVE_LOW_RUNS &&
      avg5 < ASSIST_ACTIVATION_AVG_THRESHOLD
    ) {
      // 発動
      return {
        active: true,
        recentRunWalls,
        consecutiveLowRuns: 0,
        activatedAtAvgWalls: avg5,
        runsSinceActivation: 0,
        activatedCount: current.activatedCount + 1,
      };
    }

    return { ...current, recentRunWalls, consecutiveLowRuns };
  }

  // 発動中: 最低滞在ラン数・相対解除・強制解除を判定
  const runsSinceActivation = current.runsSinceActivation + 1;

  if (runsSinceActivation >= ASSIST_FORCE_RELEASE_AT_RUNS) {
    // 完全解除
    return {
      active: false,
      recentRunWalls,
      consecutiveLowRuns: 0,
      activatedAtAvgWalls: 0,
      runsSinceActivation: 0,
      activatedCount: current.activatedCount,
    };
  }

  if (runsSinceActivation >= ASSIST_MIN_STAY_RUNS) {
    const releaseThreshold = current.activatedAtAvgWalls * ASSIST_RELATIVE_RELEASE_MULTIPLIER;
    if (avg5 >= releaseThreshold) {
      return {
        active: false,
        recentRunWalls,
        consecutiveLowRuns: 0,
        activatedAtAvgWalls: 0,
        runsSinceActivation: 0,
        activatedCount: current.activatedCount,
      };
    }
  }

  return { ...current, recentRunWalls, runsSinceActivation };
}

/**
 * 現在の `assist` 状態から、今このラン中に適用すべき角幅上乗せの b0（b0 パラメータそのもの。
 * 実際の角幅上乗せは difficultyCurve.assistBonusAngle 相当の式に、この b0 を渡して計算する）を返す。
 * 非発動中は 0（＝上乗せなし）。発動から30ラン以上経過で半減する。
 */
export function currentAssistB0(assist: SaveDataAssist): number {
  if (!assist.active) return 0;
  return assist.runsSinceActivation >= ASSIST_HALVE_AT_RUNS ? ASSIST_B0_HALVED : 0.8;
}
