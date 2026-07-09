import 'server-only';
import { sql, type Kysely } from 'kysely';
import { randomBytes } from 'node:crypto';
import type { CortexDB, ObservationRow } from '../db/db-types';
import { TENANT_ID } from '../db';
import { assertAuthorized, type Actor } from '../auth';
import { normalizeProject } from './normalize';
import {
  sessionStartSchema,
  sessionEndSchema,
  timelineSchema,
  contextSchema,
  type SessionStartInput,
  type SessionEndInput,
  type TimelineInput,
  type ContextInput,
} from './validation';
import type {
  SessionStartResult,
  SessionEndResult,
  TimelineResult,
  ContextResult,
  PromptRow,
  SessionRow,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genSyncId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString('hex')}`;
}

/**
 * Ensure a session exists, creating it if needed.
 * Reused by saveObservation (store.ts) and other domain functions.
 */
export async function ensureSession(
  db: Kysely<CortexDB>,
  tenantId: string,
  sessionId: string | null,
  project: string | null,
): Promise<string> {
  const sid = sessionId ?? genSyncId('sess');
  const existing = await sql<{ id: string }>`
    SELECT id FROM sessions WHERE tenant_id = ${tenantId} AND id = ${sid}
  `.execute(db);
  if (existing.rows[0]) return sid;
  await sql`
    INSERT INTO sessions (id, tenant_id, project, directory, started_at)
    VALUES (${sid}, ${tenantId}, ${project ?? 'unknown'}, 'unknown', datetime('now'))
  `.execute(db);
  return sid;
}

// ---------------------------------------------------------------------------
// mem_session_start -> StartSession (doc §3.13)
// ---------------------------------------------------------------------------

/**
 * Start a new coding session.
 */
export async function startSession(
  db: Kysely<CortexDB>,
  actor: Actor,
  input: SessionStartInput,
): Promise<SessionStartResult> {
  await assertAuthorized(db, actor, input.project, 'write');

  const tenantId = TENANT_ID();
  const project = normalizeProject(input.project);

  await sql`
    INSERT INTO sessions (id, tenant_id, project, directory, started_at)
    VALUES (${input.id}, ${tenantId}, ${project ?? 'unknown'}, ${input.directory}, datetime('now'))
  `.execute(db);

  return { id: input.id };
}

// ---------------------------------------------------------------------------
// mem_session_end / mem_session_summary -> EndSession (doc §3.13)
// ---------------------------------------------------------------------------

/**
 * End a session with optional summary.
 */
export async function endSession(
  db: Kysely<CortexDB>,
  actor: Actor,
  input: SessionEndInput,
): Promise<SessionEndResult> {
  // Auth: we need the session's project for the check
  const tenantId = TENANT_ID();
  const session = await sql<{ project: string }>`
    SELECT project FROM sessions WHERE tenant_id = ${tenantId} AND id = ${input.id}
  `.execute(db);
  if (!session.rows[0]) throw new Error('Session not found');

  await assertAuthorized(db, actor, session.rows[0].project, 'write');

  const r = await sql`
    UPDATE sessions SET ended_at = datetime('now'), summary = ${input.summary ?? null}
    WHERE tenant_id = ${tenantId} AND id = ${input.id}
  `.execute(db);

  if (r.numAffectedRows !== undefined && Number(r.numAffectedRows) === 0) {
    throw new Error('Session not found');
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// P4 — Consultas multi-query
// ---------------------------------------------------------------------------

/**
 * Chronological neighborhood within the same session (doc §3.6).
 */
export async function getTimeline(
  db: Kysely<CortexDB>,
  actor: Actor,
  input: TimelineInput,
): Promise<TimelineResult> {
  const tenantId = TENANT_ID();

  // 1) Fetch focus observation
  const focus = await sql<ObservationRow>`
    SELECT * FROM observations WHERE tenant_id = ${tenantId} AND id = ${input.focus_id} AND deleted_at IS NULL
  `.execute(db);
  const focusObs = focus.rows[0] ?? null;

  // 2) Auth check
  if (focusObs) {
    await assertAuthorized(db, actor, focusObs.project, 'read');
  }

  // If no focus or no session_id, before/after are empty
  if (!focusObs || !focusObs.session_id) {
    return { focus: focusObs, before: [], after: [] };
  }

  // 3) Before entries (older, same session, DESC limit before)
  const before = await sql<ObservationRow>`
    SELECT * FROM observations
    WHERE tenant_id = ${tenantId} AND session_id = ${focusObs.session_id}
      AND id < ${input.focus_id} AND deleted_at IS NULL
    ORDER BY id DESC
    LIMIT ${input.before}
  `.execute(db);

  // 4) After entries (newer, same session, ASC limit after)
  const after = await sql<ObservationRow>`
    SELECT * FROM observations
    WHERE tenant_id = ${tenantId} AND session_id = ${focusObs.session_id}
      AND id > ${input.focus_id} AND deleted_at IS NULL
    ORDER BY id ASC
    LIMIT ${input.after}
  `.execute(db);

  return {
    focus: focusObs,
    before: before.rows,
    after: after.rows,
  };
}

/**
 * Aggregate recent sessions, pinned observations, recent unpinned,
 * and recent prompts (doc §3.7).
 */
export async function getContext(
  db: Kysely<CortexDB>,
  actor: Actor,
  input: ContextInput,
): Promise<ContextResult> {
  const tenantId = TENANT_ID();
  const project = normalizeProject(input.project);

  // Auth check
  await assertAuthorized(db, actor, project, 'read');

  const scope = input.scope;
  const maxContext = input.max_context ?? 50;

  // 1) Recent sessions (5)
  const sessions = await sql<SessionRow>`
    SELECT * FROM sessions
    WHERE tenant_id = ${tenantId}
      ${project ? sql`AND LOWER(project) = ${project}` : sql``}
    ORDER BY datetime(started_at) DESC
    LIMIT 5
  `.execute(db);

  // 2) Pinned observations
  const pinned = await sql<ObservationRow>`
    SELECT * FROM observations
    WHERE tenant_id = ${tenantId} AND deleted_at IS NULL AND pinned = 1
      ${project ? sql`AND LOWER(project) = ${project}` : sql``}
      ${scope ? sql`AND scope = ${scope}` : sql``}
    ORDER BY datetime(created_at) DESC, id DESC
  `.execute(db);

  // 3) Recent unpinned
  const recent = await sql<ObservationRow>`
    SELECT * FROM observations
    WHERE tenant_id = ${tenantId} AND deleted_at IS NULL AND pinned = 0
      ${project ? sql`AND LOWER(project) = ${project}` : sql``}
      ${scope ? sql`AND scope = ${scope}` : sql``}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ${maxContext}
  `.execute(db);

  // 4) Recent prompts (10)
  const prompts = await sql<PromptRow>`
    SELECT id, session_id, content, project, created_at FROM user_prompts
    WHERE tenant_id = ${tenantId}
      ${project ? sql`AND LOWER(project) = ${project}` : sql``}
    ORDER BY created_at DESC
    LIMIT 10
  `.execute(db);

  const allSessions = sessions.rows;
  const allPinned = pinned.rows;
  const allRecent = recent.rows;
  const allPrompts = prompts.rows;

  return {
    sessions: allSessions,
    pinned: allPinned,
    recent: allRecent,
    prompts: allPrompts,
    count: allSessions.length + allPinned.length + allRecent.length + allPrompts.length,
  };
}
