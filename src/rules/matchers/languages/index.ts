import path from 'node:path'

import { csharp } from './csharp.js'
import { javascript } from './javascript.js'
import { python } from './python.js'
import { ruby } from './ruby.js'
import { typescript } from './typescript.js'

const REGISTRY = [typescript, javascript, python, csharp, ruby] as const

export function inferLanguage(filePath: string) {
  const ext = path.extname(filePath)
  return REGISTRY.find((lang) =>
    (lang.extensions as readonly string[]).includes(ext),
  )
}
