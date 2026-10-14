// Harness-module shapes for the reverse of the invoice "import-only first
// step" scenario: there the import lands first and the calling code follows;
// here the calling code is already on disk from an earlier allowed write and
// the import arrives last. The validator must judge the import-only diff as
// scaffolding rather than re-litigate the code it completes. Pairs with the
// harness-green-code-first transcript.

/**
 * State after the transcript's statement-first write: renderRows() already
 * references Selection and ItemId, both unresolved. The import that
 * completes them is {@link HARNESS_SELECTION_WITH_IMPORT}.
 */
export const HARNESS_SELECTION_UNIMPORTED = `export class Harness {
  private readonly items: string[]

  constructor(items: string[]) {
    this.items = items
  }

  renderRows(): string[] {
    const selection = new Selection(ItemId.named('first'))
    return this.items.map((item, index) =>
      selection.covers(index) ? \`> \${item}\` : item,
    )
  }
}
`

/**
 * The pending action: only the import line the on-disk statement needs.
 * No behavior changes; the diff is pure symbol resolution.
 */
export const HARNESS_SELECTION_WITH_IMPORT = `import { ItemId, Selection } from './selection.js'

export class Harness {
  private readonly items: string[]

  constructor(items: string[]) {
    this.items = items
  }

  renderRows(): string[] {
    const selection = new Selection(ItemId.named('first'))
    return this.items.map((item, index) =>
      selection.covers(index) ? \`> \${item}\` : item,
    )
  }
}
`
