import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTimeline, resolveDb, timelineSchema, type TimelineInput } from '@/modules/core/domain';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemTimeline(server: McpServer): void {
  server.registerTool(
    'mem_timeline',
    {
      description:
        'Get chronological neighborhood of an observation within the same session. Returns focus, before, and after entries.',
      inputSchema: timelineSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) throw new Error('Unauthorized: missing or invalid token');
        const parsed = timelineSchema.parse(args) as TimelineInput;
        const db = await resolveDb();
        const result = await getTimeline(db, actor, parsed);
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
