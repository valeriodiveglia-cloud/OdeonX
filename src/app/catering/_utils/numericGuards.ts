// src/app/event-calculator/_utils/numberGuards.ts
// Helpers numerici minimali, puri e riusabili nel modulo Event Calculator.

export function toNum(v: string, fallback = 0): number {
  if (v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function clampPos(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}
