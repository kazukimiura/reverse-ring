"use client";

/**
 * 3-2-1カウントダウン（GDD確定仕様）。タブ復帰後・広告視聴後の再開時は必ず表示する。
 */
export default function CountdownOverlay({ remainingSec }: { remainingSec: number }) {
  const step = Math.max(1, Math.ceil(remainingSec));
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span
        key={step}
        className="font-orbitron text-7xl font-black text-[#EAFEFF]"
        style={{ textShadow: "0 0 20px #4DE8FF" }}
      >
        {step}
      </span>
    </div>
  );
}
