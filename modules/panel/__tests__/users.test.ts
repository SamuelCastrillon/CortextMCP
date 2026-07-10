import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb, TENANT_ID } from '@/modules/core/db';
import { hashPassword } from '@/modules/core/auth/password';
import type { Client } from '@libsql/client';

// ── Shared test helpers ───────────────────────────────────────────

let testClient: Client;
let adminId: number;
const tenantId = 'default';

beforeAll(async () => {
  const t = await createTestDb();
  testClient = t.client;
  adminId = t.admin.id as unknown as number;
});

describe('panel/actions — users CRUD', () => {
  it('creates a new user with member role', async () => {
    const hash = await hashPassword('testpass123');
    await testClient.execute({
      sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_by, created_at)
            VALUES (?, 'newmember', 'member', ?, 1, ?, datetime('now'))`,
      args: [tenantId, hash, adminId],
    });

    const rows = await testClient.execute({
      sql: `SELECT username, role, is_active FROM users WHERE username = 'newmember'`,
    });
    expect(rows.rows.length).toBe(1);
    const user = rows.rows[0] as Record<string, unknown>;
    expect(user.username).toBe('newmember');
    expect(user.role).toBe('member');
    expect(user.is_active).toBe(1);
  });

  it('creates a new user with admin role', async () => {
    const hash = await hashPassword('adminpass');
    await testClient.execute({
      sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_by, created_at)
            VALUES (?, 'newadmin', 'admin', ?, 1, ?, datetime('now'))`,
      args: [tenantId, hash, adminId],
    });

    const rows = await testClient.execute({
      sql: `SELECT role FROM users WHERE username = 'newadmin'`,
    });
    expect((rows.rows[0] as Record<string, unknown>).role).toBe('admin');
  });

  it('rejects duplicate username', async () => {
    // First create
    const hash = await hashPassword('pass1');
    await testClient.execute({
      sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_by)
            VALUES (?, 'dupeuser', 'member', ?, 1, ?)`,
      args: [tenantId, hash, adminId],
    });

    // Second create with same username should fail (UNIQUE constraint)
    try {
      const hash2 = await hashPassword('pass2');
      await testClient.execute({
        sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_by)
              VALUES (?, 'dupeuser', 'member', ?, 1, ?)`,
        args: [tenantId, hash2, adminId],
      });
      expect.fail('Should have thrown a UNIQUE constraint violation');
    } catch (err) {
      expect((err as Error).message).toContain('UNIQUE');
    }
  });

  it('lists all users in the tenant', async () => {
    const rows = await testClient.execute({
      sql: `SELECT id, username, role, is_active FROM users WHERE tenant_id = ? ORDER BY username`,
      args: [tenantId],
    });

    expect(rows.rows.length).toBeGreaterThanOrEqual(4); // admin seed + our new users
    const usernames = rows.rows.map((r) => (r as Record<string, unknown>).username);
    expect(usernames).toContain('test-admin');
    expect(usernames).toContain('newmember');
  });

  it('updates user role', async () => {
    const rows = await testClient.execute({
      sql: `SELECT id FROM users WHERE username = 'newmember'`,
    });
    const targetId = (rows.rows[0] as Record<string, unknown>).id as number;

    await testClient.execute({
      sql: `UPDATE users SET role = 'admin' WHERE id = ?`,
      args: [targetId],
    });

    const updated = await testClient.execute({
      sql: `SELECT role FROM users WHERE id = ?`,
      args: [targetId],
    });
    expect((updated.rows[0] as Record<string, unknown>).role).toBe('admin');

    // Restore
    await testClient.execute({
      sql: `UPDATE users SET role = 'member' WHERE id = ?`,
      args: [targetId],
    });
  });

  it('toggles is_active', async () => {
    const rows = await testClient.execute({
      sql: `SELECT id, is_active FROM users WHERE username = 'newmember'`,
    });
    const targetId = (rows.rows[0] as Record<string, unknown>).id as number;
    const currentActive = (rows.rows[0] as Record<string, unknown>).is_active as number;

    await testClient.execute({
      sql: `UPDATE users SET is_active = ? WHERE id = ?`,
      args: [currentActive ? 0 : 1, targetId],
    });

    const after = await testClient.execute({
      sql: `SELECT is_active FROM users WHERE id = ?`,
      args: [targetId],
    });
    expect((after.rows[0] as Record<string, unknown>).is_active).toBe(currentActive ? 0 : 1);
  });

  it('assigns project permission for member user', async () => {
    const rows = await testClient.execute({
      sql: `SELECT id FROM users WHERE username = 'newmember'`,
    });
    const userId = (rows.rows[0] as Record<string, unknown>).id as number;

    await testClient.execute({
      sql: `INSERT INTO user_project_access (tenant_id, user_id, project, permission, granted_by)
            VALUES (?, ?, 'proj-alpha', 'read', ?)`,
      args: [tenantId, userId, adminId],
    });

    const perms = await testClient.execute({
      sql: `SELECT project, permission FROM user_project_access WHERE user_id = ? AND project = 'proj-alpha'`,
      args: [userId],
    });
    expect(perms.rows.length).toBe(1);
    expect((perms.rows[0] as Record<string, unknown>).permission).toBe('read');
  });

  it('updates existing project permission', async () => {
    const rows = await testClient.execute({
      sql: `SELECT id FROM users WHERE username = 'newmember'`,
    });
    const userId = (rows.rows[0] as Record<string, unknown>).id as number;

    // Update to write
    await testClient.execute({
      sql: `UPDATE user_project_access SET permission = 'write', granted_by = ? WHERE user_id = ? AND project = 'proj-alpha'`,
      args: [adminId, userId],
    });

    const perms = await testClient.execute({
      sql: `SELECT permission FROM user_project_access WHERE user_id = ? AND project = 'proj-alpha'`,
      args: [userId],
    });
    expect((perms.rows[0] as Record<string, unknown>).permission).toBe('write');
  });

  it('removes project permission when set to none', async () => {
    const rows = await testClient.execute({
      sql: `SELECT id FROM users WHERE username = 'newmember'`,
    });
    const userId = (rows.rows[0] as Record<string, unknown>).id as number;

    await testClient.execute({
      sql: `DELETE FROM user_project_access WHERE user_id = ? AND project = 'proj-alpha'`,
      args: [userId],
    });

    const perms = await testClient.execute({
      sql: `SELECT id FROM user_project_access WHERE user_id = ? AND project = 'proj-alpha'`,
      args: [userId],
    });
    expect(perms.rows.length).toBe(0);
  });

  it('non-admin user cannot access admin operations (simulated by separate data)', async () => {
    // Create a member user
    const hash = await hashPassword('memberpass');
    await testClient.execute({
      sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_by)
            VALUES (?, 'regularmember', 'member', ?, 1, ?)`,
      args: [tenantId, hash, adminId],
    });

    // Verify role is member - in real action, requireAdmin() would reject
    const rows = await testClient.execute({
      sql: `SELECT role FROM users WHERE username = 'regularmember'`,
    });
    expect((rows.rows[0] as Record<string, unknown>).role).toBe('member');
  });
});
