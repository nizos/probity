import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createFixture, type FileTree } from 'fs-fixture'
import { onTestFinished } from 'vitest'

/**
 * Materializes the given `FileTree` as a real directory on disk under
 * `os.tmpdir()` — actual files, dirs, and symlinks the bin and rule
 * engine can operate against — and registers `onTestFinished` cleanup
 * so the sandbox is removed when the test ends. Call from inside a
 * test (or test hook) so the cleanup lands in the right context.
 *
 * Returns the fs-fixture handle; use `sandbox.path` for the root and
 * `sandbox.getPath('subdir/file')` to address contents.
 */
export async function createSandbox(files: FileTree) {
  const fixture = await createFixture(files)
  onTestFinished(() => fixture.rm())
  return fixture
}

/**
 * Creates an empty tempdir under `os.tmpdir()` and registers the
 * passed `onCleanup` to remove it. Returns the directory path.
 * Designed for `test.extend(...)` fixtures that supply their own
 * `onCleanup` rather than going through `onTestFinished`.
 */
export async function makeSandboxDir(
  onCleanup: (fn: () => Promise<void> | void) => void,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'probity-'))
  onCleanup(() => rm(dir, { recursive: true, force: true }))
  return dir
}
