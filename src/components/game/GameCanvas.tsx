"use client";

import { useCallback, useEffect, useRef } from "react";
import { useGameStore } from "@/store/gameStore";
import { renderFrame, type Viewport } from "./renderer";
import {
  DRAW_SCALE_FACTOR,
  DRAW_SCALE_MAX_PX,
  DRAW_SCALE_MIN_PX,
  MAX_DEVICE_PIXEL_RATIO,
  RING_CENTER_Y_RATIO,
} from "@/lib/game/constants";

/**
 * Canvas描画・ゲームループの統合コンポーネント。
 *
 * - requestAnimationFrame でstore.tick(deltaMs)を毎フレーム呼び、直後に描画する
 *   （GDD技術的留意事項1: dtベース更新。dtのクランプ自体はstore側で行う）
 * - タップ判定領域は画面全面（GDD確定仕様）。pointerdownのみを見る（click/touchendは待たない）
 * - visibilitychangeで即座にポーズし、復帰時は3-2-1カウントダウンを挟む（GDD確定仕様）
 * - devicePixelRatioは2にクランプする（GDD技術的留意事項6）
 */
export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<Viewport>({ widthPx: 0, heightPx: 0, centerXPx: 0, centerYPx: 0, rPx: 60 });
  const pausedRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number | null>(null);

  const recomputeViewport = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const widthPx = container.clientWidth;
    const heightPx = container.clientHeight;
    const minDimension = Math.min(widthPx, heightPx);
    const rPx = Math.min(Math.max(minDimension * DRAW_SCALE_FACTOR, DRAW_SCALE_MIN_PX), DRAW_SCALE_MAX_PX);

    viewportRef.current = {
      widthPx,
      heightPx,
      centerXPx: widthPx / 2,
      centerYPx: heightPx * RING_CENTER_Y_RATIO,
      rPx,
    };

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    canvas.width = Math.round(widthPx * dpr);
    canvas.height = Math.round(heightPx * dpr);
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${heightPx}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    useGameStore.getState().checkViewport(minDimension);
  }, []);

  useEffect(() => {
    recomputeViewport();
    const handleResize = () => recomputeViewport();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [recomputeViewport]);

  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        pausedRef.current = true;
        return;
      }
      pausedRef.current = false;
      previousTimeRef.current = null;
      const s = useGameStore.getState();
      if (s.phase === "playing") {
        useGameStore.setState({ phase: "countdown", countdownRemainingSec: 3 });
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    function loop(timestamp: number) {
      if (previousTimeRef.current === null) previousTimeRef.current = timestamp;
      const deltaMs = timestamp - previousTimeRef.current;
      previousTimeRef.current = timestamp;

      if (!pausedRef.current) {
        useGameStore.getState().tick(deltaMs);
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) {
        const s = useGameStore.getState();
        renderFrame(ctx, {
          viewport: viewportRef.current,
          timeSec: s.gameClockSec,
          nDisp: s.nDisp,
          shipAngle: s.shipAngle,
          activeWalls: s.activeWalls,
          phase: s.phase,
          deathInfo: s.deathInfo,
          lastNearMiss: s.lastNearMiss,
          reducedMotion: s.saveData.settings.reducedMotion,
        });
      }

      rafIdRef.current = requestAnimationFrame(loop);
    }

    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  const handlePointerDown = useCallback(() => {
    useGameStore.getState().handlePointerDown();
  }, []);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onContextMenu={(e) => e.preventDefault()}
      className="absolute inset-0 touch-none select-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
