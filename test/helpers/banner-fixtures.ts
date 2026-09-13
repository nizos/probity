// Fixtures for the red-after-deletion case. The obsolete test pinning the bare
// context is already deleted and the suite is green. BANNER_TESTS is the file at
// that green; BANNER_TESTS_WITH_CONTEXT_LABEL adds the one test that drives the
// labelled form — a plain red step with no prior failing run to point at.

export const BANNER_TESTS = `import { describe, expect, it } from 'vitest'

import { renderBanner } from './banner.js'

describe('renderBanner', () => {
  it('renders the title', () => {
    expect(renderBanner({ title: 'App', context: 'Development' })).toContain(
      'App',
    )
  })

  it('renders the version', () => {
    expect(
      renderBanner({ title: 'App', context: 'Development', version: '1.4.0' }),
    ).toContain('1.4.0')
  })
})
`

export const BANNER_TESTS_WITH_CONTEXT_LABEL = `import { describe, expect, it } from 'vitest'

import { renderBanner } from './banner.js'

describe('renderBanner', () => {
  it('renders the title', () => {
    expect(renderBanner({ title: 'App', context: 'Development' })).toContain(
      'App',
    )
  })

  it('renders the version', () => {
    expect(
      renderBanner({ title: 'App', context: 'Development', version: '1.4.0' }),
    ).toContain('1.4.0')
  })

  it('labels the context', () => {
    expect(renderBanner({ title: 'App', context: 'Development' })).toContain(
      'Context: Development',
    )
  })
})
`
