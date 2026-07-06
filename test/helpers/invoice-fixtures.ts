// Invoice-module shapes for the two multi-step "import-only first step"
// allow tests. Both pin the same principle from opposite phase directions:
// the validator must not demand a multi-step change be delivered in one
// write. Pairs with the invoice-green-in-steps and invoice-refactor-in-steps
// transcripts.

/**
 * State after the green transcript's clean red: lineTotal is done and
 * invoiceTotal exists as a stub whose 0 the assertion rejects. The next
 * green step is {@link INVOICE_TOTAL_STUBBED_WITH_IMPORT}.
 */
export const INVOICE_TOTAL_STUBBED = `export function lineTotal(qty: number, unitPrice: number): number {
  return qty * unitPrice
}

export function invoiceTotal(lines: number[]): number {
  return 0
}
`

/**
 * First step of driving the observed red to green: only the helper
 * import the upcoming implementation needs. The stub body is unchanged;
 * the write that uses the helper comes next.
 */
export const INVOICE_TOTAL_STUBBED_WITH_IMPORT = `import { roundToCents } from './money.js'

export function lineTotal(qty: number, unitPrice: number): number {
  return qty * unitPrice
}

export function invoiceTotal(lines: number[]): number {
  return 0
}
`

/**
 * State after two completed cycles in the refactor transcript: the suite
 * is green and invoiceTotal rounds inline. The agent's next refactor step
 * is {@link INVOICE_INLINE_ROUNDING_WITH_IMPORT}.
 */
export const INVOICE_INLINE_ROUNDING = `export function lineTotal(qty: number, unitPrice: number): number {
  return qty * unitPrice
}

export function invoiceTotal(lines: number[]): number {
  const total = lines.reduce((sum, line) => sum + line, 0) * 1.0825
  return Math.round(total * 100) / 100
}
`

/**
 * First step of a self-initiated refactor under green: import the shared
 * helper that duplicates the inline rounding, swap the call sites in the
 * next write.
 */
export const INVOICE_INLINE_ROUNDING_WITH_IMPORT = `import { roundToCents } from './money.js'

export function lineTotal(qty: number, unitPrice: number): number {
  return qty * unitPrice
}

export function invoiceTotal(lines: number[]): number {
  const total = lines.reduce((sum, line) => sum + line, 0) * 1.0825
  return Math.round(total * 100) / 100
}
`
