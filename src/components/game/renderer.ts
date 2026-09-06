/**
 * Canvas 2D 描画 — shared/design/ReverseRing_ゲームスタイルガイド.md 準拠。
 *
 * 画像アセットを一切使わず、すべてベクター描画（arc/gradient）で構成する。
 * レイヤー構成（描画順）: 背景 → アンビエント微粒子 → リング軌道 → 壁 → 自機 → エフェクト。
 * 論理座標（R=1の無次元系）はここで初めて px に変換する（ゲーム状態そのものには触れない）。
 */
import { normalizeAngle } from "@/lib/game/angleMath";
import {
  RING_RADIUS,
  SHIP_DRAW_RADIUS,
  WALL_DRAW_THICKNESS,
} from "@/lib/game/constants";
import { gapCenterAt, wallRadiusAt, type ActiveWall } from "@/lib/game/wallEngine";
import { zoneForNDisp } from "@/lib/game/zones";
import { THEME } from "@/lib/game/theme";
import type { DeathInfo } from "@/store/gameStore";

export interface Viewport {
  widthPx: number;
  heightPx: number;
  centerXPx: number;
  centerYPx: number;
  rPx: number;
}

export interface RenderFrameInput {
  viewport: Viewport;
  timeSec: number;
  nDisp: number;
  shipAngle: number;
  activeWalls: ActiveWall[];
  phase: string;
  deathInfo: DeathInfo | null;
  lastNearMiss: { atSec: number; angle: number } | null;
  reducedMotion: boolean;
}

function toPx(v: Viewport, radiusR: number, angle: number): { x: number; y: number } {
  return {
    x: v.centerXPx + Math.cos(angle) * radiusR * v.rPx,
    y: v.centerYPx + Math.sin(angle) * radiusR * v.rPx,
  };
}

function drawBackground(ctx: CanvasRenderingContext2D, v: Viewport, zoneId: number): void {
  const ambient = THEME.zoneAmbient[zoneId] ?? THEME.zoneAmbient[1];
  ctx.fillStyle = ambient.background;
  ctx.fillRect(0, 0, v.widthPx, v.heightPx);
}

/** 決定論的な疑似乱数（インデックスから0〜1を生成。パーティクル配置に使う。毎フレーム同じ配置になる） */
function hashUnit(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function drawParticles(ctx: CanvasRenderingContext2D, v: Viewport, zoneId: number, timeSec: number, reducedMotion: boolean): void {
  const ambient = THEME.zoneAmbient[zoneId] ?? THEME.zoneAmbient[1];
  const count = Math.round(12 + ambient.particleDensity * 40);
  const drift = reducedMotion ? 0 : timeSec * 0.02;
  ctx.fillStyle = ambient.particleColor;
  for (let i = 0; i < count; i++) {
    const seedX = hashUnit(i * 2.1);
    const seedY = hashUnit(i * 3.7 + 1);
    const seedPhase = hashUnit(i * 5.3 + 2);
    const x = ((seedX + drift * (0.3 + seedPhase * 0.7)) % 1) * v.widthPx;
    const y = ((seedY + Math.sin(timeSec * 0.15 + seedPhase * 10) * 0.02) % 1) * v.heightPx;
    const size = 1 + seedPhase * 2;
    ctx.globalAlpha = 0.05 + ambient.particleDensity * 0.05;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRing(ctx: CanvasRenderingContext2D, v: Viewport): void {
  ctx.strokeStyle = THEME.colors.ringGuide;
  ctx.lineWidth = Math.max(1, v.rPx * 0.015);
  ctx.beginPath();
  ctx.arc(v.centerXPx, v.centerYPx, RING_RADIUS * v.rPx, 0, Math.PI * 2);
  ctx.stroke();
}

function drawGapArc(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  radiusR: number,
  centerAngle: number,
  halfWidth: number,
  color: string,
  lineWidthPx: number,
  glow: boolean
): void {
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = lineWidthPx * 1.5;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidthPx;
  ctx.beginPath();
  ctx.arc(v.centerXPx, v.centerYPx, radiusR * v.rPx, centerAngle - halfWidth, centerAngle + halfWidth);
  ctx.stroke();
  ctx.restore();
}

function drawWall(ctx: CanvasRenderingContext2D, v: Viewport, wall: ActiveWall, tSec: number, shipAngle: number): void {
  const radiusR = wallRadiusAt(wall, tSec);
  if (radiusR < 0.02 || radiusR > 2.5) return;
  const lineWidthPx = WALL_DRAW_THICKNESS * v.rPx;
  const halfWidth = wall.thetaGapEff / 2;

  // 壁本体（ブロック区間）: 全周を描いてから、切れ目区間だけ上から塗り直す方式にする
  ctx.strokeStyle = THEME.colors.wallBlock;
  ctx.lineWidth = lineWidthPx;
  ctx.beginPath();
  ctx.arc(v.centerXPx, v.centerYPx, radiusR * v.rPx, 0, Math.PI * 2);
  ctx.stroke();

  const gapCount = wall.gapCentersAtSpawn.length;
  for (let i = 0; i < gapCount; i++) {
    const center = wall.followsShip ? shipAngle : gapCenterAt(wall, i, tSec);
    drawGapArc(ctx, v, radiusR, center, halfWidth, THEME.colors.gapSafe, lineWidthPx, true);

    // 回転パターンの補助表現: 回転方向へ薄い流線を添える
    if (wall.spin !== 0) {
      const tailAngle = center - Math.sign(wall.spin) * halfWidth * 1.4;
      ctx.save();
      ctx.globalAlpha = 0.35;
      drawGapArc(ctx, v, radiusR, tailAngle, halfWidth * 0.3, THEME.colors.gapSafe, lineWidthPx * 0.6, false);
      ctx.restore();
    }
  }
}

function drawShip(ctx: CanvasRenderingContext2D, v: Viewport, angle: number, colorCore: string, colorGlow: string): void {
  const p = toPx(v, RING_RADIUS, angle);
  const glowR = SHIP_DRAW_RADIUS * v.rPx * 1.8;
  const coreR = SHIP_DRAW_RADIUS * v.rPx * 0.55;

  const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
  gradient.addColorStop(0, colorGlow);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colorCore;
  ctx.beginPath();
  ctx.arc(p.x, p.y, coreR, 0, Math.PI * 2);
  ctx.fill();
}

function drawNearMiss(ctx: CanvasRenderingContext2D, v: Viewport, angle: number, progress: number): void {
  // progress: 0(発生直後)→1(消滅)。半径方向のショックウェーブを1本広げる
  const p = toPx(v, RING_RADIUS, angle);
  const radius = (SHIP_DRAW_RADIUS * 1.5 + progress * SHIP_DRAW_RADIUS * 3) * v.rPx;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - progress);
  ctx.strokeStyle = THEME.colors.nearMissGold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function renderFrame(ctx: CanvasRenderingContext2D, input: RenderFrameInput): void {
  const { viewport: v } = input;
  const zone = zoneForNDisp(input.nDisp);

  drawBackground(ctx, v, zone.id);
  drawParticles(ctx, v, zone.id, input.timeSec, input.reducedMotion);
  drawRing(ctx, v);

  if (input.phase === "dead" && input.deathInfo) {
    // 死亡演出: 被弾した壁の切れ目・自機のみ赤発光。他は描画しない（数値・テキストなし）
    drawGapArc(
      ctx,
      v,
      RING_RADIUS,
      input.deathInfo.gapCenterAngle,
      input.deathInfo.thetaGapEff / 2,
      THEME.colors.deathAlertRed,
      WALL_DRAW_THICKNESS * v.rPx,
      true
    );
    drawShip(ctx, v, input.deathInfo.shipAngle, THEME.colors.deathAlertRed, THEME.colors.deathAlertRed);
    return;
  }

  for (const wall of input.activeWalls) {
    drawWall(ctx, v, wall, input.timeSec, input.shipAngle);
  }

  drawShip(ctx, v, normalizeAngle(input.shipAngle), THEME.colors.shipCore, THEME.colors.shipGlow);

  if (input.lastNearMiss && !input.reducedMotion) {
    const elapsed = input.timeSec - input.lastNearMiss.atSec;
    const durationSec = THEME.animation.nearMissMs / 1000;
    if (elapsed >= 0 && elapsed < durationSec) {
      drawNearMiss(ctx, v, input.lastNearMiss.angle, elapsed / durationSec);
    }
  }
}
