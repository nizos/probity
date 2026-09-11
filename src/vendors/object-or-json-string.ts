import { z } from 'zod'

import { JsonString } from '../utils/json-string.js'

/**
 * Accepts a payload field a vendor may send either as a structured object
 * or as a JSON-encoded string of that same object. Copilot moved from the
 * string form to the object form and both remain in the wild, so the shape
 * is described once and accepted either way rather than spelled out twice
 * per tool.
 */
export function objectOrJsonString<T extends z.ZodType>(schema: T) {
  return z.union([schema, JsonString.pipe(schema)])
}
