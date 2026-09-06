/**
 * 広告接触フック — GDD「広告接触設計」章。
 *
 * 実際の広告SDK連携は行わない。「インタースティシャル表示タイミングが来た」ことを
 * 呼び出し側（ストア）が検知できるよう、判定結果（boolean）と更新後のセッション状態を返す
 * 純粋関数として実装する。リワード広告（コンティニュー）も同様に、実際の広告再生は行わず
 * 「任意タップで発火」する導線として扱う。
 */
import type { SessionAdState } from "./saveData";

export const INITIAL_PROTECTION_PLAYS = 3;
export const INTERSTITIAL_FREQUENCY = 4;
export const SHORT_RUN_GATE_SEC = 20;
export const TIME_TRIGGER_MS = 10 * 60 * 1000;
export const SESSION_MAX_INTERSTITIALS = 6;

export interface InterstitialDecisionInput {
  session: SessionAdState;
  /** ラン終了時点での累計プレイ回数（このランを含む） */
  totalPlayCount: number;
  /** 直前のランの生存時間（秒） */
  lastRunSurvivalSec: number;
  now: Date;
}

export interface InterstitialDecisionResult {
  shouldShow: boolean;
  nextSession: SessionAdState;
}

/**
 * リザルト画面遷移直後に1回だけ呼び出す想定。
 *
 * 仕様（GDD確定）:
 * - 1〜3回目のプレイは広告なし
 * - 4回目以降、4プレイに1回（4, 8, 12, …）
 * - 直前のランの生存時間が20秒未満ならスキップし、次の機会に繰り越す（`pendingInterstitial`）
 * - 前回表示から10分以上経過していれば回数条件に関わらず候補になる（20秒ゲートは維持）
 * - 20秒ゲートと10分トリガーが競合した場合、20秒ゲートを優先してスキップし、
 *   `lastInterstitialAt` は更新せず10分の経過をリセットしない（v1.2・N15）
 * - セッション上限6回に達したら以降は表示しない
 */
export function decideInterstitial(input: InterstitialDecisionInput): InterstitialDecisionResult {
  const { session, totalPlayCount, lastRunSurvivalSec, now } = input;

  if (session.interstitialsShown >= SESSION_MAX_INTERSTITIALS) {
    return { shouldShow: false, nextSession: session };
  }

  const playsSinceLastInterstitial = session.playsSinceLastInterstitial + 1;

  if (totalPlayCount <= INITIAL_PROTECTION_PLAYS) {
    return {
      shouldShow: false,
      nextSession: { ...session, playsSinceLastInterstitial },
    };
  }

  const lastAt = session.lastInterstitialAt ? new Date(session.lastInterstitialAt).getTime() : null;
  const timeSinceLastMs = lastAt !== null ? now.getTime() - lastAt : Number.POSITIVE_INFINITY;

  const countCandidate =
    session.pendingInterstitial || playsSinceLastInterstitial >= INTERSTITIAL_FREQUENCY;
  const timeCandidate = timeSinceLastMs >= TIME_TRIGGER_MS;
  const isCandidate = countCandidate || timeCandidate;

  if (!isCandidate) {
    return { shouldShow: false, nextSession: { ...session, playsSinceLastInterstitial } };
  }

  const passesShortRunGate = lastRunSurvivalSec >= SHORT_RUN_GATE_SEC;

  if (!passesShortRunGate) {
    // 20秒ゲートでスキップ。lastInterstitialAt は更新せず、次の機会に繰り越す。
    return {
      shouldShow: false,
      nextSession: { ...session, playsSinceLastInterstitial, pendingInterstitial: true },
    };
  }

  return {
    shouldShow: true,
    nextSession: {
      ...session,
      playsSinceLastInterstitial: 0,
      pendingInterstitial: false,
      lastInterstitialAt: now.toISOString(),
      interstitialsShown: session.interstitialsShown + 1,
    },
  };
}

/** リワード広告（コンティニュー）。1ラン1回まで。呼び出し側でラン内フラグを管理する。 */
export const CONTINUE_MAX_PER_RUN = 1;

/** コンティニュー復帰直後、次の3枚に上乗せする角幅（GDD確定仕様） */
export const CONTINUE_BUFF_GAP_BONUS_RAD = 0.3;
export const CONTINUE_BUFF_WALL_COUNT = 3;
