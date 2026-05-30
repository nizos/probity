/**
 * Distinctive SDK error phrases each vendor emits when the host
 * isn't authenticated. Anchored to the full phrase so an AI verdict
 * mentioning '401' or 'authentication' in passing won't false-positive.
 */
const AUTH_FAILURE_PATTERNS: readonly RegExp[] = [
  /unexpected status 401 Unauthorized: Missing bearer or basic authentication in header/i,
  /Session was not created with authentication info or custom provider/i,
  /Not logged in · Please run \/login/i,
]

export function isVendorAuthFailure(reason: string | undefined): boolean {
  if (!reason) return false
  return AUTH_FAILURE_PATTERNS.some((p) => p.test(reason))
}
