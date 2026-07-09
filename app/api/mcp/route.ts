import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { verifyToken, actorFromAuthInfo } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { saveObservation, searchObservations } from '@/lib/store';
import { saveSchema, searchSchema } from '@/lib/validation';

const handler = createMcpHandler(
  (server) => {
    server.registerTool('ping', { description: 'Health check / server info' }, async () => ({
      content: [{ type: 'text', text: 'CortextMCP MCP server is alive' }],
    }));

    server.registerTool(
      'mem_save',
      {
        description:
          'Save a memory observation (Engram-compatible). Upserts by topic_key, dedupes within 15 min, and surfaces conflicts via judgment_required/candidates.',
        inputSchema: saveSchema.shape,
      },
      async (args, extra) => {
        try {
          const actor = actorFromAuthInfo(extra.authInfo);
          if (!actor) throw new Error('Unauthorized: missing or invalid token');
          const parsed = saveSchema.parse(args);
          const db = await getDb();
          const result = await saveObservation(db, actor, parsed);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (e) {
          return {
            content: [{ type: 'text', text: `Error: ${(e as Error).message}` }],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      'mem_search',
      {
        description:
          'Search memories (Engram-compatible FTS5 bm25 ranking). Direct topic_key match when the query contains "/".',
        inputSchema: searchSchema.shape,
      },
      async (args, extra) => {
        try {
          const actor = actorFromAuthInfo(extra.authInfo);
          if (!actor) throw new Error('Unauthorized: missing or invalid token');
          const parsed = searchSchema.parse(args);
          const db = await getDb();
          const result = await searchObservations(db, actor, parsed);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (e) {
          return {
            content: [{ type: 'text', text: `Error: ${(e as Error).message}` }],
            isError: true,
          };
        }
      },
    );
  },
  {},
  { basePath: '/api' },
);

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ['read:memories'],
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
