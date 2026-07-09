import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '@/modules/core/db';
import {
  saveObservation,
  getObservation,
  getStats,
  getCurrentProject,
  suggestTopicKey,
  pinObservation,
  unpinObservation,
  savePrompt,
  updateObservation,
  deleteObservation,
} from '@/modules/core/domain';
import { startSession, endSession, getTimeline, getContext } from '@/modules/core/domain/store-session';
import type { Actor } from '@/modules/core/auth';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { CortexDB } from '@/modules/core/db';

let db: Kysely<CortexDB>;
let admin: Actor;

beforeEach(async () => {
  const t = await createTestDb();
  db = t.db;
  admin = { userId: Number(t.admin.id), role: 'admin', username: t.admin.username };
});

// ----------------------------------------------------------------------------
// P1 — Lectura simple
// ----------------------------------------------------------------------------

describe('mem_get_observation — P1', () => {
  it('returns observation by id', async () => {
    const saved = await saveObservation(db, admin, {
      title: 'test obs',
      content: 'test content here',
      type: 'manual',
      project: 'p',
    });
    const found = await getObservation(db, admin, { id: saved.id });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(saved.id);
    expect(found!.title).toBe('test obs');
  });

  it('returns null for non-existent id', async () => {
    const found = await getObservation(db, admin, { id: 99999 });
    expect(found).toBeNull();
  });

  it('returns null for soft-deleted observation', async () => {
    const saved = await saveObservation(db, admin, {
      title: 'to delete',
      content: 'will delete',
      type: 'manual',
      project: 'p',
    });
    await sql`UPDATE observations SET deleted_at = datetime('now') WHERE id = ${saved.id}`.execute(db);
    const found = await getObservation(db, admin, { id: saved.id });
    expect(found).toBeNull();
  });

  it('throws on unauthorized actor', async () => {
    const member: Actor = { userId: 999, role: 'member', username: 'noone' };
    await expect(getObservation(db, member, { id: 1 })).rejects.toThrow(/Forbidden/);
  });
});

describe('mem_stats — P1', () => {
  it('returns zeros for empty tenant', async () => {
    const stats = await getStats(db, admin);
    expect(stats.sessions).toBe(0);
    expect(stats.observations).toBe(0);
    expect(stats.prompts).toBe(0);
    expect(stats.projects).toEqual([]);
  });

  it('reflects saved content', async () => {
    await saveObservation(db, admin, { title: 'a', content: 'aa', type: 'manual', project: 'p1' });
    await saveObservation(db, admin, { title: 'b', content: 'bb', type: 'decision', project: 'p2' });
    const stats = await getStats(db, admin);
    expect(stats.observations).toBe(2);
    expect(stats.projects).toContain('p1');
    expect(stats.projects).toContain('p2');
  });
});

describe('mem_current_project — P1', () => {
  it('returns explicit project when provided', async () => {
    const r = await getCurrentProject(db, admin, { project: 'my-project' });
    expect(r.project).toBe('my-project');
    expect(r.project_source).toBe('explicit');
  });

  it('returns null when no activity and no arg', async () => {
    const r = await getCurrentProject(db, admin, {});
    expect(r.project).toBeNull();
    expect(r.project_source).toBe('none');
  });

  it('returns most recent project from activity', async () => {
    await saveObservation(db, admin, { title: 'x', content: 'y', type: 'manual', project: 'recent-proj' });
    const r = await getCurrentProject(db, admin, {});
    expect(r.project).toBe('recent-proj');
    expect(r.project_source).toBe('recent_activity');
    expect(r.available_projects).toContain('recent-proj');
  });
});

describe('mem_suggest_topic_key — P1', () => {
  it('maps type to prefix', () => {
    expect(suggestTopicKey({ title: 'JWT auth', type: 'architecture' }).topic_key).toMatch(/^architecture\//);
    expect(suggestTopicKey({ title: 'bug fix', type: 'bugfix' }).topic_key).toMatch(/^bug\//);
    expect(suggestTopicKey({ title: 'decision 1', type: 'decision' }).topic_key).toMatch(/^decision\//);
  });

  it('defaults to manual/ for unknown types', () => {
    const r = suggestTopicKey({ title: 'note' });
    expect(r.topic_key).toMatch(/^manual\//);
  });

  it('slugifies title', () => {
    const r = suggestTopicKey({ title: 'My Cool Decision!', type: 'decision' });
    expect(r.topic_key).toBe('decision/my-cool-decision');
  });
});

// ----------------------------------------------------------------------------
// P2 — Escritura simple
// ----------------------------------------------------------------------------

describe('mem_pin / mem_unpin — P2', () => {
  it('pins an observation then unpins it', async () => {
    const saved = await saveObservation(db, admin, { title: 'pinme', content: 'content', type: 'manual', project: 'p' });
    const pin = await pinObservation(db, admin, { id: saved.id });
    expect(pin.success).toBe(true);
    const pinned = await getObservation(db, admin, { id: saved.id });
    expect(pinned!.pinned).toBe(1);

    const unpin = await unpinObservation(db, admin, { id: saved.id });
    expect(unpin.success).toBe(true);
    const unpinned = await getObservation(db, admin, { id: saved.id });
    expect(unpinned!.pinned).toBe(0);
  });

  it('throws on non-existent id', async () => {
    await expect(pinObservation(db, admin, { id: 99999 })).rejects.toThrow('Observation not found');
  });
});

describe('mem_save_prompt — P2', () => {
  beforeEach(async () => {
    // Ensure session exists for foreign key
    await sql`INSERT INTO sessions (id, tenant_id, project, directory, started_at)
              VALUES ('prompt-sess', 'default', 'p', '/tmp', datetime('now'))`.execute(db);
  });

  it('saves a prompt and returns id + sync_id', async () => {
    const r = await savePrompt(db, admin, {
      content: 'user asked something',
      session_id: 'prompt-sess',
      project: 'my-proj',
    });
    expect(r.id).toBeGreaterThan(0);
    expect(r.sync_id).toMatch(/^prompt-/);

    const row = await db
      .selectFrom('user_prompts')
      .selectAll()
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow();
    expect(row.content).toBe('user asked something');
    expect(row.project).toBe('my-proj');
  });

  it('rejects empty content', async () => {
    await expect(
      savePrompt(db, admin, { content: '', session_id: 's-1' } as any),
    ).rejects.toThrow();
  });
});

describe('mem_session_start / mem_session_end — P2', () => {
  it('starts and ends a session', async () => {
    const start = await startSession(db, admin, {
      id: 'sess-p2-test',
      project: 'p',
      directory: '/tmp',
    });
    expect(start.id).toBe('sess-p2-test');

    const end = await endSession(db, admin, { id: 'sess-p2-test', summary: 'done' });
    expect(end.success).toBe(true);
  });

  it('throws ending non-existent session', async () => {
    await expect(endSession(db, admin, { id: 'no-such-session' })).rejects.toThrow('Session not found');
  });
});

// ----------------------------------------------------------------------------
// P3 — Escritura media
// ----------------------------------------------------------------------------

describe('mem_update — P3', () => {
  it('partial update: changes only supplied fields, bumps revision_count', async () => {
    const saved = await saveObservation(db, admin, {
      title: 'original title',
      content: 'original content',
      type: 'manual',
      project: 'p',
    });
    const updated = await updateObservation(db, admin, {
      id: saved.id,
      title: 'updated title',
    });
    expect(updated.id).toBe(saved.id);
    expect(updated.revision_count).toBe(saved.revision_count + 1);

    const row = await getObservation(db, admin, { id: saved.id });
    expect(row!.title).toBe('updated title');
    expect(row!.content).toBe('original content'); // unchanged
    expect(row!.revision_count).toBe(2);
  });

  it('recomputes normalized_hash when content changes', async () => {
    const saved = await saveObservation(db, admin, {
      title: 'hash test',
      content: 'old content',
      type: 'manual',
      project: 'p',
    });
    const updated = await updateObservation(db, admin, {
      id: saved.id,
      content: 'new content',
    });
    expect(updated.revision_count).toBe(2);

    const row = await getObservation(db, admin, { id: saved.id });
    expect(row!.content).toBe('new content');
    expect(row!.normalized_hash).not.toBeNull();
  });

  it('strips <private> tags from new title and content', async () => {
    const saved = await saveObservation(db, admin, {
      title: 'private test',
      content: 'clean content',
      type: 'manual',
      project: 'p',
    });
    await updateObservation(db, admin, {
      id: saved.id,
      title: 'public <private>secret</private> title',
      content: 'public <private>secret</private> content',
    });
    const row = await getObservation(db, admin, { id: saved.id });
    expect(row!.title).toBe('public  title');
    expect(row!.content).toBe('public  content');
  });

  it('throws on non-existent id', async () => {
    await expect(updateObservation(db, admin, { id: 99999 })).rejects.toThrow('Observation not found');
  });

  it('throws on soft-deleted observation', async () => {
    const saved = await saveObservation(db, admin, {
      title: 'to delete',
      content: 'will delete',
      type: 'manual',
      project: 'p',
    });
    await sql`UPDATE observations SET deleted_at = datetime('now') WHERE id = ${saved.id}`.execute(db);
    await expect(updateObservation(db, admin, { id: saved.id })).rejects.toThrow('Observation not found');
  });
});

describe('mem_delete — P3', () => {
  it('soft-deletes an observation (default)', async () => {
    const saved = await saveObservation(db, admin, {
      title: 'soft delete me',
      content: 'content',
      type: 'manual',
      project: 'p',
    });
    const result = await deleteObservation(db, admin, { id: saved.id });
    expect(result.success).toBe(true);

    const row = await getObservation(db, admin, { id: saved.id });
    expect(row).toBeNull(); // getObservation filters deleted_at

    // Verify deleted_at is set
    const raw = await sql<{ deleted_at: string | null }>`
      SELECT deleted_at FROM observations WHERE id = ${saved.id}
    `.execute(db);
    expect(raw.rows[0].deleted_at).not.toBeNull();
  });

  it('hard-deletes an observation and orphans memory_relations', async () => {
    // Create two observations and a memory_relation between them
    const a = await saveObservation(db, admin, {
      title: 'obs a',
      content: 'content a',
      type: 'manual',
      project: 'p',
    });
    const b = await saveObservation(db, admin, {
      title: 'obs b',
      content: 'content b',
      type: 'manual',
      project: 'p',
    });
    // Create a memory relation manually
    const relSync = 'rel-' + require('node:crypto').randomBytes(8).toString('hex');
    await sql`
      INSERT INTO memory_relations (tenant_id, sync_id, source_id, target_id, relation, judgment_status)
      VALUES ('default', ${relSync}, ${a.sync_id}, ${b.sync_id}, 'related', 'pending')
    `.execute(db);

    // Hard-delete obs a
    const result = await deleteObservation(db, admin, { id: a.id, hard_delete: true });
    expect(result.success).toBe(true);

    // Observation should be gone
    const row = await getObservation(db, admin, { id: a.id });
    expect(row).toBeNull();

    // Memory relation should be orphaned
    const rel = await sql<{ judgment_status: string }>`
      SELECT judgment_status FROM memory_relations WHERE sync_id = ${relSync}
    `.execute(db);
    expect(rel.rows[0].judgment_status).toBe('orphaned');
  });

  it('throws on non-existent id', async () => {
    await expect(deleteObservation(db, admin, { id: 99999 })).rejects.toThrow('Observation not found');
  });

  it('throws on already-deleted observation', async () => {
    const saved = await saveObservation(db, admin, {
      title: 'already deleted',
      content: 'bye',
      type: 'manual',
      project: 'p',
    });
    await deleteObservation(db, admin, { id: saved.id });
    await expect(deleteObservation(db, admin, { id: saved.id })).rejects.toThrow('Observation not found');
  });
});

// ----------------------------------------------------------------------------
// P4 — Consultas multi-query
// ----------------------------------------------------------------------------

describe('mem_timeline — P4', () => {
  it('returns focus + before/after within same session', async () => {
    // Create session first
    const sessionId = 'timeline-session';
    await sql`INSERT INTO sessions (id, tenant_id, project, directory, started_at)
              VALUES (${sessionId}, 'default', 'p', '/tmp', datetime('now'))`.execute(db);

    // Save observations in sequence
    const first = await saveObservation(db, admin, { title: 'first', content: '1', type: 'manual', project: 'p', session_id: sessionId });
    const second = await saveObservation(db, admin, { title: 'second', content: '2', type: 'manual', project: 'p', session_id: sessionId });
    const third = await saveObservation(db, admin, { title: 'third', content: '3', type: 'manual', project: 'p', session_id: sessionId });

    const result = await getTimeline(db, admin, { focus_id: second.id, before: 5, after: 5 });
    expect(result.focus).not.toBeNull();
    expect(result.focus!.id).toBe(second.id);
    expect(result.before.length).toBe(1);
    expect(result.before[0].id).toBe(first.id);
    expect(result.after.length).toBe(1);
    expect(result.after[0].id).toBe(third.id);
  });

  it('returns empty before/after when focus is at edges', async () => {
    const sessionId = 'timeline-edges';
    await sql`INSERT INTO sessions (id, tenant_id, project, directory, started_at)
              VALUES (${sessionId}, 'default', 'p', '/tmp', datetime('now'))`.execute(db);
    const first = await saveObservation(db, admin, { title: 'first', content: '1', type: 'manual', project: 'p', session_id: sessionId });
    const last = await saveObservation(db, admin, { title: 'last', content: '2', type: 'manual', project: 'p', session_id: sessionId });

    // Focus at beginning
    const start = await getTimeline(db, admin, { focus_id: first.id, before: 5, after: 5 });
    expect(start.focus!.id).toBe(first.id);
    expect(start.before).toEqual([]);
    expect(start.after.length).toBe(1);

    // Focus at end
    const end = await getTimeline(db, admin, { focus_id: last.id, before: 5, after: 5 });
    expect(end.focus!.id).toBe(last.id);
    expect(end.before.length).toBe(1);
    expect(end.after).toEqual([]);
  });

  it('returns focus null for non-existent id, before/after empty', async () => {
    const result = await getTimeline(db, admin, { focus_id: 99999 });
    expect(result.focus).toBeNull();
    expect(result.before).toEqual([]);
    expect(result.after).toEqual([]);
  });

  it('respects before/after limits', async () => {
    // Create session
    const sessionId = 'timeline-limits';
    await sql`INSERT INTO sessions (id, tenant_id, project, directory, started_at)
              VALUES (${sessionId}, 'default', 'p', '/tmp', datetime('now'))`.execute(db);
    // Create many observations in same session
    const ids: number[] = [];
    for (let i = 0; i < 10; i++) {
      const obs = await saveObservation(db, admin, { title: `item-${i}`, content: String(i), type: 'manual', project: 'p', session_id: sessionId });
      ids.push(obs.id);
    }

    // Focus at index 5 (0-indexed), before=3 after=2
    const focusId = ids[5];
    const result = await getTimeline(db, admin, { focus_id: focusId, before: 3, after: 2 });
    expect(result.focus!.id).toBe(focusId);
    expect(result.before.length).toBeLessThanOrEqual(3);
    expect(result.after.length).toBeLessThanOrEqual(2);

    // Verify correct ordering: before is DESC, after is ASC
    if (result.before.length >= 2) {
      expect(Number(result.before[0].id)).toBeGreaterThan(Number(result.before[1].id));
    }
    if (result.after.length >= 2) {
      expect(Number(result.after[0].id)).toBeLessThan(Number(result.after[1].id));
    }
  });
});

describe('mem_context — P4', () => {
  it('returns empty results for empty tenant', async () => {
    const result = await getContext(db, admin, {});
    expect(result.sessions).toEqual([]);
    expect(result.pinned).toEqual([]);
    expect(result.recent).toEqual([]);
    expect(result.prompts).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('returns pinned + recent observations and sessions', async () => {
    // Create a session
    await startSession(db, admin, { id: 'ctx-session', project: 'p', directory: '/tmp' });

    // Create a pinned observation
    const pinned = await saveObservation(db, admin, { title: 'pinned obs', content: 'important', type: 'manual', project: 'p' });
    await pinObservation(db, admin, { id: pinned.id });

    // Create a recent unpinned observation
    const recent = await saveObservation(db, admin, { title: 'recent obs', content: 'new stuff', type: 'manual', project: 'p' });

    const result = await getContext(db, admin, { project: 'p' });
    expect(result.sessions.length).toBeGreaterThanOrEqual(1);
    expect(result.pinned.length).toBeGreaterThanOrEqual(1);
    expect(result.pinned[0].id).toBe(pinned.id);
    expect(result.recent.length).toBeGreaterThanOrEqual(1);
    expect(result.count).toBeGreaterThanOrEqual(3);
  });

  it('filters by project when provided', async () => {
    await saveObservation(db, admin, { title: 'project a', content: 'data', type: 'manual', project: 'proja' });
    await saveObservation(db, admin, { title: 'project b', content: 'data', type: 'manual', project: 'projb' });

    const resultA = await getContext(db, admin, { project: 'proja' });
    expect(resultA.recent.every((r) => r.project === 'proja' || r.project === null)).toBe(true);
  });

  it('filters by scope when provided', async () => {
    await saveObservation(db, admin, { title: 'scope project', content: 'data', type: 'manual', project: 'p', scope: 'project' });
    await saveObservation(db, admin, { title: 'scope personal', content: 'data', type: 'manual', project: 'p', scope: 'personal' });

    const result = await getContext(db, admin, { project: 'p', scope: 'personal' });
    expect(result.recent.every((r) => r.scope === 'personal')).toBe(true);
  });
});
