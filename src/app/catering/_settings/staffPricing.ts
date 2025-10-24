// src/app/catering/_settings/staffPricing.ts

/**
 * Helper di calcolo per la card Staff.
 * Regole dal brief:
 * - MarkupX è sempre un moltiplicatore (es. 1.5 = +50%)
 * - Niente arrotondamenti qui. La formattazione è responsabilità della UI.
 * - Input numerici crudi, nessuna formattazione a stringa.
 */

export type StaffCalcInput = {
  cost_per_hour: number
  hours: number
  markup_x: number // moltiplicatore > 0
}

/**
 * Calcola il costo riga: cost_per_hour × hours
 */
export function calcStaffCost(cost_per_hour: number, hours: number): number {
  const c = Number.isFinite(cost_per_hour) ? cost_per_hour : 0
  const h = Number.isFinite(hours) ? hours : 0
  if (c < 0 || h < 0) return 0
  return c * h
}

/**
 * Calcola il price riga: cost × markup_x
 */
export function calcStaffPrice(cost: number, markup_x: number): number {
  const base = Number.isFinite(cost) && cost > 0 ? cost : 0
  const mul = Number.isFinite(markup_x) && markup_x > 0 ? markup_x : 1
  return base * mul
}

/**
 * Calcolo completo per una riga Staff
 */
export function calcStaffLine(input: StaffCalcInput) {
  const cost = calcStaffCost(input.cost_per_hour, input.hours)
  const price = calcStaffPrice(cost, input.markup_x)
  return { cost, price }
}

/**
 * Totali a partire da un array di righe staff.
 * rows: array di { cost_per_hour, hours }
 * markup_x: moltiplicatore card
 */
export function calcStaffTotals(
  rows: Array<{ cost_per_hour: number; hours: number }>,
  markup_x: number
) {
  const mul = Number.isFinite(markup_x) && markup_x > 0 ? markup_x : 1
  let costTotal = 0
  for (const r of rows) {
    costTotal += calcStaffCost(r.cost_per_hour, r.hours)
  }
  const priceTotal = calcStaffPrice(costTotal, mul)
  return { costTotal, priceTotal }
}
