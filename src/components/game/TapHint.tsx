"use client";

/**
 * 文字ゼロの導入体験（GDD 対策1）用の唯一の文字表示。
 * 「TAP」の3文字＋脈打つタップアイコンのみ。初回タップで即座にフェードアウトする。
 * スタイルガイド: Orbitronで表示し、自機の真下・画面中央よりやや下に置く。
 */
export default function TapHint() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-start justify-center">
      <div className="mt-[58vh] flex flex-col items-center gap-2 animate-pulse">
        <span
          className="font-orbitron text-2xl font-black tracking-[0.3em] text-[#EAFEFF]"
          style={{ textShadow: "0 0 12px #4DE8FF" }}
        >
          TAP
        </span>
      </div>
    </div>
  );
}
