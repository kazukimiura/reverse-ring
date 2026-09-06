"use client";

import type { LastRunResult } from "@/store/gameStore";
import type { SaveData } from "@/lib/game/saveData";

export interface ResultOverlayProps {
  lastResult: LastRunResult;
  saveData: SaveData;
  canContinue: boolean;
  onRetry: () => void;
  onContinue: () => void;
  onReturnToTitle: () => void;
}

/**
 * リザルト画面（DOMオーバーレイ）。
 * shared/design/ReverseRing_ゲームスタイルガイド.md「リザルト画面」レイアウトに準拠。
 * プレイ中は文字を一切出さないGDDの方針上、数値・テキストが登場するのはこの画面のみ。
 */
export default function ResultOverlay({
  lastResult,
  saveData,
  canContinue,
  onRetry,
  onContinue,
  onReturnToTitle,
}: ResultOverlayProps) {
  const wallsToNextBest = saveData.best.walls - lastResult.wallsPassed;
  const disqualified = lastResult.wasAssisted || lastResult.usedContinue;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between bg-[#0B0E14]/90 px-6 py-10 text-center">
      <div className="flex flex-col items-center gap-1">
        {lastResult.isFirstZoneVisit && !disqualified && (
          <span className="font-orbitron rounded-full border border-[#FFD966]/40 px-3 py-1 text-xs font-bold tracking-wide text-[#FFD966]">
            {lastResult.zone.name} 初到達
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <span
          className="font-orbitron text-7xl font-black tabular-nums text-[#EAFEFF]"
          style={{ textShadow: "0 0 18px #4DE8FF" }}
        >
          {lastResult.wallsPassed}
        </span>

        {disqualified ? (
          <p className="font-zen text-xs text-[#6FF0E0]/70">記録対象外のラン</p>
        ) : lastResult.isNewRecordWalls ? (
          <p className="font-orbitron text-sm font-bold text-[#FFD966]">NEW RECORD</p>
        ) : (
          <p className="font-zen text-sm text-[#6FF0E0]">
            あと {Math.max(wallsToNextBest, 0)} 枚でベスト更新
          </p>
        )}

        <p className="font-orbitron mt-4 text-lg tabular-nums text-[#6FF0E0]/80">
          SCORE {lastResult.score.toLocaleString("ja-JP")}
        </p>
      </div>

      <div className="flex w-full max-w-[360px] flex-col items-center gap-3">
        {canContinue && (
          <button
            type="button"
            onClick={onContinue}
            className="w-full rounded-full border border-[#FFD452]/50 bg-transparent px-6 py-3 font-zen text-sm font-medium text-[#FFD452] transition-colors active:bg-[#FFD452]/10"
          >
            広告を見て1枚前から再開
          </button>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="font-orbitron w-full rounded-full bg-[#3A3FE0] px-8 py-4 text-lg font-black text-white shadow-[0_4px_16px_rgba(58,63,224,0.5)] transition-transform active:translate-y-0.5"
        >
          もう一度 ▶
        </button>
        <button
          type="button"
          onClick={onReturnToTitle}
          className="font-zen rounded-full px-4 py-1.5 text-xs text-[#6FF0E0]/50"
        >
          タイトルへ
        </button>
      </div>
    </div>
  );
}
