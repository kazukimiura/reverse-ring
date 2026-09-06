/**
 * ReverseRing — 幾何・物理の固定パラメータ
 *
 * 準拠: shared/structure/ReverseRing_GDD.md v1.2.0
 *   「座標系・単位系と当たり判定」「技術的留意事項（コーダーへの申し送り）」
 *
 * 論理側はすべて「リング半径 R = 1」を基準単位とする無次元系で持つ。
 * 端末幅が変わっても難易度が変わらないことを保証するための最重要ルールであり、
 * px への換算は描画直前（GameCanvas）でのみ行うこと。
 */

/** リング半径 R（基準単位。常に 1） */
export const RING_RADIUS = 1;

/** 自機の判定半径 r_p（GDD: 0.075R） */
export const SHIP_HIT_RADIUS = 0.075;

/** 自機の描画半径（判定より一回り大きく描く。GDD: 0.09R） */
export const SHIP_DRAW_RADIUS = 0.09;

/** 壁の出現半径 R_spawn（GDD: 2.4R） */
export const WALL_SPAWN_RADIUS = 2.4;

/** 壁の描画厚み t_w（描画専用。判定には一切使わない。GDD: 0.10R） */
export const WALL_DRAW_THICKNESS = 0.10;

/**
 * dt のクランプ上限（秒）。GDD 技術的留意事項1（最重要）。
 * タブ復帰・GC・低スペック端末のヒッチで dt が跳ねると壁がワープするため、
 * 1/30秒（0.0333秒）を超える経過は切り詰める。
 */
export const MAX_DT_SEC = 1 / 30;

/** 描画スケール算出係数（GDD 座標系章・技術申し送り5） */
export const DRAW_SCALE_FACTOR = 0.19;
export const DRAW_SCALE_MIN_PX = 48;
export const DRAW_SCALE_MAX_PX = 120;

/**
 * これを下回るビューポートでは「壁が出現の瞬間から画面内に収まる」という
 * 到達可能性保証の前提が崩れるため、プレイを開始させず案内を表示する（GDD S2）。
 */
export const MIN_VIEWPORT_PX = 230;

/** devicePixelRatio のクランプ上限（GDD 技術申し送り6） */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/** リング中心の画面上のY座標（画面高さに対する比率。GDD/スタイルガイド指定） */
export const RING_CENTER_Y_RATIO = 0.42;

/** ニアミス閾値（v1.2 で 0.22τ → 0.30τ に変更・N4） */
export const NEAR_MISS_THRESHOLD_RATIO = 0.30;

/** 切れ目中心の最小離隔（rad）。Δθ_max のクランプ下限にも使う（GDD記載どおり同値） */
export const MIN_GAP_SEPARATION_RAD = 0.30;

/** スコア計算の基準角幅（GDD: 100 × 1.400 / θ_gap(n_diff)）。1.400 = θ_gap の P0 */
export const SCORE_REFERENCE_GAP_ANGLE = 1.400;

/** ニアミス通過のスコア倍率 */
export const NEAR_MISS_SCORE_MULTIPLIER = 1.5;

/** 助走区間（導入壁・ウォームアップ壁）の固定スコア */
export const WARMUP_FIXED_SCORE = 100;

/** リトライ導線: 死んでから次のランが開始できるまでの上限（秒） */
export const RETRY_WINDOW_SEC = 1.5;

/** 死亡演出（切れ目・自機の位置関係を提示する静止時間。スキップ不可） */
export const DEATH_FREEZE_SEC = 0.4;

/** 3-2-1 カウントダウンの1ステップの長さ（秒） */
export const COUNTDOWN_STEP_SEC = 1.0;
