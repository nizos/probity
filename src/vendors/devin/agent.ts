import type { Agent } from '../../types.js'

/** No unverified Devin SDK or implicit use of another vendor's authentication. */
export function devin(): Agent {
  return {
    reason: () =>
      Promise.resolve({
        kind: 'violation',
        reason:
          'Devin: AI rules require an explicit Config.ai validator. Deterministic rules need no AI.',
      }),
  }
}
