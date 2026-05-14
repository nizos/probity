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
