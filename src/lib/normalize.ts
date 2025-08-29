// src/lib/normalize.ts
// NIENTE 'use client' qui: deve essere server-safe

export function toBool(v: any, fallback: boolean): boolean {
  if (v === true || v === 'true' || v === 1 || v === '1') return true
  if (v === false || v === 'false' || v === 0 || v === '0') return false
  return fallback
}
