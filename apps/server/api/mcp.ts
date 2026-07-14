// apps/server/api/mcp.ts
import { createApp } from '../src/index.js';

const app = createApp();

export default async function handler(req: Request): Promise<Response> {
  return app.fetch(req);
}
