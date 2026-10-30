import type {
  PermissionHandler,
  SystemMessageConfig,
} from '@github/copilot-sdk'

import type { Agent } from '../../types.js'
import { toVerdict } from '../to-verdict.js'

type SessionConfig = {
  availableTools?: string[]
  onPermissionRequest?: PermissionHandler
  systemMessage?: SystemMessageConfig
}

type CopilotClientLike = {
  start(): Promise<void>
  createSession(config: SessionConfig): Promise<{
    sendAndWait(args: { prompt: string }): Promise<
      | {
          data: {
            content: string
            outputTokens?: number
          }
        }
      | undefined
    >
  }>
  stop(): Promise<unknown>
}

export function githubCopilot(
  deps: {
    client?: CopilotClientLike
    onPermissionRequest?: PermissionHandler
  } = {},
): Agent {
  const reason = (prompt: string, systemMessage?: SystemMessageConfig) =>
    toVerdict(async () => {
      const { client, onPermissionRequest } = await resolveClient(deps)
      await client.start()
      const session = await client.createSession({
        availableTools: [],
        ...(onPermissionRequest && { onPermissionRequest }),
        ...(systemMessage && { systemMessage }),
      })
      const event = await session.sendAndWait({ prompt })
      await client.stop()
      if (!event) {
        throw new Error(
          'no response from copilot: sendAndWait returned undefined',
        )
      }
      const meta = buildMeta(event.data.outputTokens)
      return meta
        ? { text: event.data.content, meta }
        : { text: event.data.content }
    })
  return {
    reason,
    reasonWithSystem: ({ system, prompt }) =>
      reason(prompt, { mode: 'append', content: system }),
  }
}

type CopilotMeta = {
  outputTokens?: number
}

function buildMeta(outputTokens: number | undefined): CopilotMeta | undefined {
  if (typeof outputTokens !== 'number') return undefined
  return { outputTokens }
}

async function resolveClient(deps: {
  client?: CopilotClientLike
  onPermissionRequest?: PermissionHandler
}): Promise<{
  client: CopilotClientLike
  onPermissionRequest?: PermissionHandler
}> {
  if (deps.client) {
    return {
      client: deps.client,
      ...(deps.onPermissionRequest && {
        onPermissionRequest: deps.onPermissionRequest,
      }),
    }
  }
  const mod = await import('@github/copilot-sdk')
  return {
    client: new mod.CopilotClient({}),
    onPermissionRequest: deps.onPermissionRequest ?? mod.approveAll,
  }
}
