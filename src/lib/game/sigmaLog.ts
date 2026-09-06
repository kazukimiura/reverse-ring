/**
 * σ実測のためのログ — GDD 技術的留意事項12（最重要の計測仕様）。
 *
 * GDDが要求する打ち切り最尤推定によるσ算出は公開後にオフラインで行う分析作業であり、
 * 本実装ではその「入力データを取りこぼさず記録する」部分までを担う
 * （実際の外部送信先・分析バックエンドは本案件のスコープ外のため、直近N件を
 * メモリ上に保持するだけの軽量ログとして実装する。将来、外部送信するAPIが決まれば
 * `pushWallOutcome` の内部だけを差し替えれば済む設計にしている）。
 */

export interface WallOutcomeLogEntry {
  nDiff: number;
  patternId: string;
  tau: number;
  /** 通過時の角度差 d（被弾時は打ち切りのためtauを超えた値になる） */
  d: number;
  hit: boolean;
  firstTapLatencySec: number | null;
  slackAtArrivalSec: number | null;
  reversalsForThisWall: number;
  tapTimingErrorSec: number | null;
}

const MAX_LOG_ENTRIES = 500;

let log: WallOutcomeLogEntry[] = [];

export function pushWallOutcome(entry: WallOutcomeLogEntry): void {
  log.push(entry);
  if (log.length > MAX_LOG_ENTRIES) {
    log = log.slice(log.length - MAX_LOG_ENTRIES);
  }
}

export function getWallOutcomeLog(): readonly WallOutcomeLogEntry[] {
  return log;
}

export function clearWallOutcomeLog(): void {
  log = [];
}
