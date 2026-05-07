import { createRequire } from 'node:module'

import {
  registerDynamicLanguage,
  type DynamicLangRegistrations,
} from '@ast-grep/napi'

const require = createRequire(import.meta.url)

const PEER_DEPS: Record<string, string> = {
  python: '@ast-grep/lang-python',
  csharp: '@ast-grep/lang-csharp',
  ruby: '@ast-grep/lang-ruby',
}

const registered = new Set<string>()
const registrations: DynamicLangRegistrations = {}

for (const [name, pkg] of Object.entries(PEER_DEPS)) {
  try {
    const lang = require(pkg) as
      | DynamicLangRegistrations[string]
      | { default: DynamicLangRegistrations[string] }
    registrations[name] = 'default' in lang ? lang.default : lang
    registered.add(name)
  } catch {
    // peer-dep not installed
  }
}

if (registered.size > 0) registerDynamicLanguage(registrations)

export function isRegistered(name: string): boolean {
  return registered.has(name)
}
