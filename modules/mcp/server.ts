import 'server-only';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { verifyToken } from '@/modules/core/auth';
import { registerPing } from './tools/ping';
import { registerMemSave } from './tools/mem_save';
import { registerMemSearch } from './tools/mem_search';
import { registerMemGetObservation } from './tools/mem_get_observation';
import { registerMemStats } from './tools/mem_stats';
import { registerMemCurrentProject } from './tools/mem_current_project';
import { registerMemSuggestTopicKey } from './tools/mem_suggest_topic_key';
import { registerMemPin } from './tools/mem_pin';
import { registerMemUnpin } from './tools/mem_unpin';
import { registerMemSavePrompt } from './tools/mem_save_prompt';
import { registerMemSessionStart } from './tools/mem_session_start';
import { registerMemSessionEnd } from './tools/mem_session_end';
import { registerMemSessionSummary } from './tools/mem_session_summary';

export const handler = withMcpAuth(
  createMcpHandler(
    (server) => {
      registerPing(server);
      registerMemSave(server);
      registerMemSearch(server);
      registerMemGetObservation(server);
      registerMemStats(server);
      registerMemCurrentProject(server);
      registerMemSuggestTopicKey(server);
      registerMemPin(server);
      registerMemUnpin(server);
      registerMemSavePrompt(server);
      registerMemSessionStart(server);
      registerMemSessionEnd(server);
      registerMemSessionSummary(server);
    },
    {},
    { basePath: '/api' },
  ),
  verifyToken,
  {
    required: true,
    requiredScopes: ['read:memories'],
    resourceMetadataPath: '/.well-known/oauth-protected-resource',
  },
);
