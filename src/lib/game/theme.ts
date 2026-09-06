/**
 * テーマ設定オブジェクト — shared/design/ReverseRing_ゲームスタイルガイド.md 準拠。
 *
 * 「色・演出パラメータは1つのテーマ設定オブジェクトに集約する」というスタイルガイドの
 * 指示に従い、色・発光・ゾーンごとのアンビエント設定をすべてここにまとめる。
 * Canvas描画側（renderer.ts）はこのオブジェクトを参照するのみで、色をハードコードしない。
 */

export const COLORS = {
  voidBlack: "#0B0E14",
  ringGuide: "#2A3446",
  shipCore: "#EAFEFF",
  shipGlow: "#4DE8FF",
  wallBlock: "#3B4A63",
  gapSafe: "#6FF0E0",
  gapHighlight: "#FFFFFF",
  nearMissGold: "#FFD452",
  deathAlertRed: "#E8483C",
  ctaIndigo: "#3A3FE0",
  resultGold: "#FFD966",
} as const;

export interface ZoneAmbient {
  background: string;
  particleColor: string;
  particleDensity: number; // 0〜1 目安（Z1が最も疎、Z7が最も密）
}

/** ゾーン別・背景アンビエントカラー（GDD/スタイルガイド Z1〜Z7） */
export const ZONE_AMBIENT: Record<number, ZoneAmbient> = {
  1: { background: "#0B0E14", particleColor: "#16233A", particleDensity: 0.15 },
  2: { background: "#0B161A", particleColor: "#123B3C", particleDensity: 0.25 },
  3: { background: "#12101F", particleColor: "#2A1B4A", particleDensity: 0.35 },
  4: { background: "#170F0A", particleColor: "#3A2410", particleDensity: 0.45 },
  5: { background: "#1A0A10", particleColor: "#4A1030", particleDensity: 0.55 },
  6: { background: "#170518", particleColor: "#5A0F55", particleDensity: 0.7 },
  7: { background: "#0E0508", particleColor: "#6B1A12", particleDensity: 0.85 },
};

export const ANIMATION = {
  /** タップ反転時、光の尾の「しなり」が追従する時間 */
  trailSwingMs: 100,
  /** 通常通過の波紋 */
  normalPassMs: 100,
  /** ニアミス演出の総時間 */
  nearMissMs: 175,
  /** ニアミス発光半径の拡張倍率 */
  nearMissGlowScale: 1.75,
  /** ゾーン遷移のクロスフェード */
  zoneTransitionMs: 500,
  /** リザルトへのクロスフェード（死亡静止と同じ0.4秒を使う） */
  resultFadeMs: 400,
} as const;

export const THEME = {
  colors: COLORS,
  zoneAmbient: ZONE_AMBIENT,
  animation: ANIMATION,
} as const;

export type Theme = typeof THEME;
