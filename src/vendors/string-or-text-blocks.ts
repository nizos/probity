import { z } from 'zod'

const TextBlockSchema = z.object({ text: z.string() })

/**
 * Normalizes output that vendors may persist as either a string or an array
 * of structured blocks. Only blocks with textual content are useful to rules;
 * other block kinds are ignored rather than invalidating the whole result.
 */
export const StringOrTextBlocks = z.union([
  z.string(),
  z.array(z.unknown()).transform((blocks) =>
    blocks
      .map((block) => TextBlockSchema.safeParse(block))
      .flatMap((parsed) => (parsed.success ? [parsed.data.text] : []))
      .join('\n'),
  ),
])
