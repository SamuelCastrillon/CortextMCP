import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getContext, resolveDb, contextSchema, type ContextInput } from '@/modules/core/domain';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemContext(server: McpServer): void {
  server.registerTool(
    'mem_context',
    {
      description:
        'Get recent memory context from previous sessions. Shows recent sessions, pinned observations, recent unpinned, and recent prompts.',
      inputSchema: contextSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) throw new Error('Unauthorized: missing or invalid token');
        const parsed = contextSchema.parse(args) as ContextInput;
        const db = await resolveDb();
        const result = await getContext(db, actor, parsed);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (e) {
        return {
          content: [{ type: 'text', text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
