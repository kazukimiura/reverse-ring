/**
 * シード付き疑似乱数生成器（mulberry32）。
 *
 * GDD 技術的留意事項9: 「切れ目位置・パターン抽選は Math.random() を直接使わず、
 * シード付き PRNG（xorshift 等）で行う」。理由は2つ:
 * ①検証（企画・検証零）のシミュレーションと実装の挙動を突き合わせるには再現性が必要。
 * ②デイリーシード（上級者の延命に唯一直接効く延命策）の前提条件であり、
 *   後から入れようとすると乱数の使用箇所すべてを直す羽目になる。
 *
 * 本実装ではデイリーシードモード自体はまだ組み込んでいない（GDDも初期リリースへの
 * 組み込みは必須としていない）が、PRNGの器と `createSeedFromDate` はここに用意し、
 * 将来デイリーシードを追加する際に乱数呼び出し側を変更せずに済むようにしてある。
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) の一様乱数 */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [−range, +range] の一様乱数 */
  nextRange(range: number): number {
    return (this.next() * 2 - 1) * range;
  }

  /** [min, max) の一様乱数 */
  nextBetween(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** ±1 をコイントスで返す（回転符号のランダム化などに使用） */
  nextSign(): 1 | -1 {
    return this.next() < 0.5 ? 1 : -1;
  }

  /** [0, n) の整数インデックス */
  nextIndex(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** 現在の内部状態（コンティニュー時の巻き戻し禁止のため、進めたままにする用途） */
  getState(): number {
    return this.state;
  }

  setState(s: number): void {
    this.state = s >>> 0;
  }
}

/** 日付文字列（"2026-09-06"等）からシード整数を導出する（デイリーシード用の器） */
export function createSeedFromDate(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (Math.imul(h, 31) + dateStr.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** 通常プレイ用のランダムシードを生成する */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
