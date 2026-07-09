import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { updateObservation, resolveDb, updateSchema, type UpdateInput } from '@/modules/core/domain';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemUpdate(server: McpServer): void {
  server.registerTool(
    'mem_update',
    {
      description:
        'Update an existing observation by ID. Only provided fields are changed.',
      inputSchema: updateSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) throw new Error('Unauthorized: missing or invalid token');
        const parsed = updateSchema.parse(args) as UpdateInput;
        const db = await resolveDb();
        const result = await updateObservation(db, actor, parsed);
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
