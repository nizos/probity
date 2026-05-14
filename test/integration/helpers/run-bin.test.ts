import { createFixture } from 'fs-fixture'
import { describe, it, expect, onTestFinished } from 'vitest'

import { runBin } from './run-bin.js'

describe('runBin', () => {
  it('throws when the child exits with a non-zero code', async () => {
    const fixture = await createFixture({
      'bad-bin.js': 'process.exit(7)',
    })
    onTestFinished(async () => fixture.rm())

    await expect(
      runBin({ binPath: fixture.getPath('bad-bin.js') }),
    ).rejects.toThrow(/code=7/)
  })
})
