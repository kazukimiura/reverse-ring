"use client";

/**
 * インタースティシャル広告のプレースホルダー。
 *
 * 実際の広告SDK連携は本タスクのスコープ外（GDD広告接触設計は頻度制御ロジックのみを要求）。
 * `src/lib/game/adHooks.ts` の `decideInterstitial` が「表示タイミングが来た」ことを判定し、
 * ストアの `showInterstitialFlag` に反映する。ここではその検知結果を可視化し、
 * 実際の広告SDKに差し替える際の統合ポイントを1箇所に集約するためのダミー画面を出す。
 * GDD確定仕様どおり、表示中はリトライ導線を無効化し、終了操作で自動的にリザルトへ復帰する。
 */
export default function InterstitialPlaceholder({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
      <p className="font-orbitron text-sm tracking-widest text-white/60">AD</p>
      <button
        type="button"
        onClick={onDismiss}
        className="font-zen rounded-full border border-white/30 px-6 py-2 text-sm text-white/80"
      >
        広告を閉じる（プレースホルダー）
      </button>
    </div>
  );
}
