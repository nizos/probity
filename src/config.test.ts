import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, expect, onTestFinished } from 'vitest'

import { defineConfig, findConfig, loadConfig } from './config.js'

describe('defineConfig', () => {
  it('returns the config as-is', () => {
    const config = defineConfig({ rules: [] })

    expect(config).toEqual({ rules: [] })
  })
})

describe('loadConfig', () => {
  it('loads a config file by path', async () => {
    const fixture = path.resolve('test/fixtures/config/empty.config.ts')

    const config = await loadConfig(fixture)

    expect(config).toEqual({ rules: [] })
  })

  it('leaves a `**`-prefixed glob unanchored (its intent is match-anywhere, not scope-to-config-dir)', async () => {
    const fixture = path.resolve('test/fixtures/configs/blocks.config.ts')

    const config = await loadConfig(fixture)

    expect(config.rules[0]).toMatchObject({
      files: ['**/src/**'],
    })
  })

  it('preserves the leading `!` and anchors the rest of a negation glob', async () => {
    const fixture = path.resolve('test/fixtures/configs/negation.config.ts')

    const config = await loadConfig(fixture)

    expect(config.rules[0]).toMatchObject({
      files: ['!' + path.posix.join(path.dirname(fixture), 'src/foo.ts')],
    })
  })

  it('leaves a `!**`-prefixed glob unanchored (its intent is exclude-anywhere)', async () => {
    const fixture = path.resolve(
      'test/fixtures/configs/negation-double-star.config.ts',
    )

    const config = await loadConfig(fixture)

    expect(config.rules[0]).toMatchObject({
      files: ['!**/foo.test.ts'],
    })
  })

  it('produces POSIX-form anchored globs when the input filepath has backslashes (Windows-shape dirname)', async () => {
    // jiti normalizes `\` to `/` for filesystem lookup, but path.dirname
    // preserves the backslash inside the path component, giving root the
    // same shape as path.win32.dirname of `C:\\src\\probity.config.ts`.
    const parent = await mkdtemp(path.join(tmpdir(), 'probity-windows-sim-'))
    onTestFinished(async () => {
      await rm(parent, { recursive: true, force: true })
    })
    const realDir = path.join(parent, 'win', 'style')
    await mkdir(realDir, { recursive: true })
    await writeFile(
      path.join(realDir, 'probity.config.ts'),
      `import { defineConfig, forbidContentPattern } from '@nizos/probity'
export default defineConfig({
  rules: [
    {
      files: ['src/**'],
      rules: [forbidContentPattern({ match: /./, reason: 'x' })],
    },
  ],
})
`,
    )
    const winShapedPath = `${parent}/win\\style/probity.config.ts`

    const config = await loadConfig(winShapedPath)
    const block = config.rules[0] as { files: readonly string[] }

    expect(block.files[0]).not.toContain('\\')
  })

  it('resolves `@nizos/probity` from a config file that lives outside the package tree', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'probity-config-import-'))
    onTestFinished(async () => {
      await rm(dir, { recursive: true, force: true })
    })
    const configPath = path.join(dir, 'probity.config.ts')
    await writeFile(
      configPath,
      `import { defineConfig } from '@nizos/probity'\n` +
        `export default defineConfig({ rules: [] })\n`,
    )

    const config = await loadConfig(configPath)

    expect(config).toEqual({ rules: [] })
  })
})

describe('findConfig', () => {
  it('walks up from the start dir until it finds probity.config.ts', () => {
    const startDir = path.resolve('test/fixtures/config/discovery/subdir')

    const result = findConfig(startDir)

    expect(result).toBe(
      path.resolve('test/fixtures/config/discovery/probity.config.ts'),
    )
  })

  it('finds a .js config when no .ts variant exists alongside it', () => {
    const startDir = path.resolve('test/fixtures/config/discovery-js')

    const result = findConfig(startDir)

    expect(result).toBe(
      path.resolve('test/fixtures/config/discovery-js/probity.config.js'),
    )
  })

  it('throws with all tried extensions listed when no config is found', () => {
    expect(() => findConfig('/tmp')).toThrow(
      /probity\.config\.\{ts,mts,js,mjs\}/,
    )
  })
})
