"use client";

import { useGameStore } from "@/store/gameStore";
import GameCanvas from "./GameCanvas";
import TapHint from "./TapHint";
import CountdownOverlay from "./CountdownOverlay";
import ResultOverlay from "./ResultOverlay";
import SmallScreenGuard from "./SmallScreenGuard";
import InterstitialPlaceholder from "./InterstitialPlaceholder";

/**
 * ゲーム画面の統合コンポーネント。`app/page.tsx` からはこれを呼び出すだけでよい。
 *
 * GDD確定仕様「タイトル画面がそのままプレイ画面」に従い、専用のタイトル画面コンポーネントは
 * 存在しない。Canvas（GameCanvas）を常時マウントし、フェーズに応じたDOMオーバーレイだけを
 * 重ねる構成にすることで、画面遷移のたびにCanvasを作り直さない（描画状態を保つ）。
 */
export default function GameRoot() {
  const phase = useGameStore((s) => s.phase);
  const countdownRemainingSec = useGameStore((s) => s.countdownRemainingSec);
  const lastResult = useGameStore((s) => s.lastResult);
  const saveData = useGameStore((s) => s.saveData);
  const canContinue = useGameStore((s) => s.canContinue);
  const showInterstitialFlag = useGameStore((s) => s.showInterstitialFlag);
  const retry = useGameStore((s) => s.retry);
  const continueRun = useGameStore((s) => s.continueRun);
  const returnToTitle = useGameStore((s) => s.returnToTitle);
  const acknowledgeInterstitialShown = useGameStore((s) => s.acknowledgeInterstitialShown);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0B0E14]">
      {/*
        GameCanvasは常にマウントする（GDD確定仕様「タイトル画面がそのままプレイ画面」）。
        checkViewport()（画面サイズ判定）はGameCanvasのマウント時にのみ発火するため、
        phaseで出し分けるとboot状態から一切遷移できなくなる。
      */}
      <GameCanvas />

      {phase === "smallScreen" && <SmallScreenGuard />}
      {phase === "awaitFirstTap" && <TapHint />}
      {phase === "countdown" && <CountdownOverlay remainingSec={countdownRemainingSec} />}

      {phase === "result" && lastResult && !showInterstitialFlag && (
        <ResultOverlay
          lastResult={lastResult}
          saveData={saveData}
          canContinue={canContinue}
          onRetry={retry}
          onContinue={continueRun}
          onReturnToTitle={returnToTitle}
        />
      )}

      {phase === "result" && showInterstitialFlag && (
        <InterstitialPlaceholder onDismiss={acknowledgeInterstitialShown} />
      )}
    </div>
  );
}
