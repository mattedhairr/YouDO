export function dialStep(dx: number, dy: number): -1 | 0 | 1 {
  return Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.4 ? (dx < 0 ? 1 : -1) : 0;
}
