import type { Action } from './types.js'

type WriteAction = Extract<Action, { kind: 'write' }>

export type EditDelta = Readonly<{
  oldString: string
  newString: string
  replaceAll: boolean
  occurrences: number
}>

const editDeltas = new WeakMap<WriteAction, EditDelta>()

/**
 * Keeps the vendor's validated Edit operation alongside the canonical
 * write without expanding Action's public, JSON-serializable shape.
 */
export function attachEditDelta(
  action: WriteAction,
  delta: EditDelta,
): WriteAction {
  editDeltas.set(action, { ...delta })
  return action
}

export function getEditDelta(action: Action): EditDelta | undefined {
  return action.kind === 'write' ? editDeltas.get(action) : undefined
}

/** Normalize vendor payloads and on-disk content in the same LF space. */
export function normalizeEditText(text: string): string {
  return text.replace(/\r\n/g, '\n')
}
