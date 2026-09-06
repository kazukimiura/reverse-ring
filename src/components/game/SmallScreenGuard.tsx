"use client";

/**
 * 画面が小さすぎる環境（min(vw,vh) < 230px）向けの案内画面（GDD S2）。
 * 壁が出現の瞬間に画面外になり「切れ目は最初から見える」という到達可能性保証の
 * 前提が崩れるため、無理に遊ばせずプレイを開始させない。
 */
export default function SmallScreenGuard() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0B0E14] px-6 text-center">
      <p className="font-orbitron text-lg font-bold text-[#EAFEFF]">画面が小さすぎます</p>
      <p className="font-zen text-sm text-[#6FF0E0]">
        ウィンドウを大きくするか、通常のフルスクリーン表示でお試しください。
      </p>
    </div>
  );
}
