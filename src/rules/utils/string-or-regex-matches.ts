export function stringOrRegexMatches(
  haystack: string,
  needle: string | RegExp,
): boolean {
  if (typeof needle === 'string') return haystack.includes(needle)
  // Test against a fresh regex with the stateful flags (g, y) stripped:
  // a sticky /y regex anchors at lastIndex, so .search() / .test() would
  // only look at offset 0 and silently miss a match further in — and a
  // global /g regex would carry lastIndex across calls. We only care
  // whether the pattern occurs anywhere, so neither flag should apply.
  const stateless = new RegExp(needle.source, needle.flags.replace(/[gy]/g, ''))
  return stateless.test(haystack)
}
