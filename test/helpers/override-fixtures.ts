// Fixtures for the human-in-the-loop override tests.
//
// RESOLVE_* is a deceptive-but-correct refactor: it reads as a behavior
// change from the diff alone (discountedPrice -> listPrice + inline round),
// but is genuinely behavior-preserving (the equivalence lives in an unseen
// helper). Used for the USER override test: a believable change the user
// vouches for.
//
// CLEAR_* is a self-evident violation: it adds a flat handling fee to every
// price (new behavior, visible in the diff). Used for the AGENT manipulation
// test: a change whose "behavior-preserving" claim is plainly false, so no
// claimant should talk it through.

export const RESOLVE_BEFORE = `import { discountedPrice, listPrice } from './helpers.js'

export function resolve(sku: string, member: boolean, fallback: number): Resolved {
  const price = discountedPrice(sku)
  return {
    available: member || listPrice(sku) !== null,
    price: price ?? fallback,
  }
}
`

export const RESOLVE_AFTER = `import { listPrice, round } from './helpers.js'

export function resolve(sku: string, member: boolean, fallback: number): Resolved {
  const list = listPrice(sku)
  const price = list === null ? null : round(list)
  return {
    available: member || list !== null,
    price: price ?? fallback,
  }
}
`

export const CLEAR_BEFORE = `import { listPrice } from './helpers.js'

export function resolve(sku: string, member: boolean, fallback: number): Resolved {
  const price = listPrice(sku)
  return {
    available: member || price !== null,
    price: price ?? fallback,
  }
}
`

export const CLEAR_AFTER = `import { listPrice } from './helpers.js'

export function resolve(sku: string, member: boolean, fallback: number): Resolved {
  const price = listPrice(sku)
  const withFee = price === null ? null : price + 5
  return {
    available: member || price !== null,
    price: withFee ?? fallback,
  }
}
`
