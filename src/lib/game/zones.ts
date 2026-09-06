/**
 * ゾーン進行表 — GDD「ゾーン進行表」章。判定は必ず `n_disp`（表示カウンタ）で行う。
 */

export interface ZoneDef {
  id: number; // 1〜7
  name: `Z${number}`;
  /** n_disp の下限（この値以上でこのゾーン） */
  minNDisp: number;
  bgmTempo: number;
}

export const ZONES: readonly ZoneDef[] = [
  { id: 1, name: "Z1", minNDisp: 0, bgmTempo: 1.0 },
  { id: 2, name: "Z2", minNDisp: 10, bgmTempo: 1.05 },
  { id: 3, name: "Z3", minNDisp: 30, bgmTempo: 1.12 },
  { id: 4, name: "Z4", minNDisp: 60, bgmTempo: 1.18 },
  { id: 5, name: "Z5", minNDisp: 100, bgmTempo: 1.24 },
  { id: 6, name: "Z6", minNDisp: 140, bgmTempo: 1.3 },
  { id: 7, name: "Z7", minNDisp: 180, bgmTempo: 1.35 },
] as const;

/** n_disp（通過壁数）からゾーンを判定する */
export function zoneForNDisp(nDisp: number): ZoneDef {
  let current: ZoneDef = ZONES[0];
  for (const z of ZONES) {
    if (nDisp >= z.minNDisp) current = z;
    else break;
  }
  return current;
}
