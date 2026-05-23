import type { Agent, AgentMeta } from '../../types.js'
import { toVerdict } from '../to-verdict.js'

type SessionConfig = {
  availableTools?: string[]
  onPermissionRequest?: unknown
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
    onPermissionRequest?: unknown
  } = {},
): Agent {
  return {
    reason: (prompt) =>
      toVerdict(async () => {
        const { client, onPermissionRequest } = await resolveClient(deps)
        await client.start()
        const session = await client.createSession({
          availableTools: [],
          onPermissionRequest,
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
      }),
  }
}

function buildMeta(outputTokens: number | undefined): AgentMeta | undefined {
  if (typeof outputTokens !== 'number') return undefined
  return { outputTokens }
}

async function resolveClient(deps: {
  client?: CopilotClientLike
  onPermissionRequest?: unknown
}): Promise<{ client: CopilotClientLike; onPermissionRequest?: unknown }> {
  if (deps.client) {
    return {
      client: deps.client,
      onPermissionRequest: deps.onPermissionRequest,
    }
  }
  const mod = await import('@github/copilot-sdk')
  return {
    client: new mod.CopilotClient({}),
    onPermissionRequest: deps.onPermissionRequest ?? mod.approveAll,
  }
}
