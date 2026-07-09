import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deleteObservation, resolveDb, deleteSchema, type DeleteInput } from '@/modules/core/domain';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemDelete(server: McpServer): void {
  server.registerTool(
    'mem_delete',
    {
      description:
        'Delete an observation. Soft delete (default) by setting deleted_at, or hard delete with orphaned memory_relations.',
      inputSchema: deleteSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) throw new Error('Unauthorized: missing or invalid token');
        const parsed = deleteSchema.parse(args) as DeleteInput;
        const db = await resolveDb();
        const result = await deleteObservation(db, actor, parsed);
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
