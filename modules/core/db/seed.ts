import 'server-only';
import { createClient, type Client } from '@libsql/client';
import { TENANT_ID } from './index';
import type { UserRow } from './db-types';
import { hashPassword } from '../auth/password';

/**
 * Bootstrap the first admin user from environment variables.
 * Called by seedAdmin() which acts as fallback when env vars are missing.
 */
export async function seedAdmin(client: Client): Promise<UserRow> {
  const tenantId = TENANT_ID();

  // Check if any users exist for this tenant
  const existingUsers = await client.execute({
    sql: `SELECT COUNT(*) AS cnt FROM users WHERE tenant_id = ?`,
    args: [tenantId],
  });
  const count = Number((existingUsers.rows[0] as Record<string, unknown>).cnt ?? 0);

  // If there are no users and ADMIN_USERNAME/ADMIN_PASSWORD are set, bootstrap
  if (count === 0) {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminUsername && adminPassword) {
      const hash = await hashPassword(adminPassword);
      await client.execute({
        sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_at)
              VALUES (?, ?, 'admin', ?, 1, datetime('now'))`,
        args: [tenantId, adminUsername, hash],
      });
    } else {
      // Dev fallback: create a dev-admin with a placeholder hash
      await client.execute({
        sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_at)
              VALUES (?, 'dev-admin', 'admin', 'dev-bypass-not-for-production', 1, datetime('now'))`,
        args: [tenantId],
      });
    }
  }

  // Seed default instance_settings if not present
  const regSetting = await client.execute({
    sql: `SELECT value FROM instance_settings WHERE key = 'registration_enabled'`,
  });
  if (regSetting.rows.length === 0) {
    await client.execute({
      sql: `INSERT INTO instance_settings (key, value, updated_at) VALUES ('registration_enabled', '0', datetime('now'))`,
    });
  }

  // Return the first admin user (alphabetically first username for determinism)
  const admin = await client.execute({
    sql: `SELECT * FROM users WHERE tenant_id = ? AND role = 'admin' ORDER BY username ASC LIMIT 1`,
    args: [tenantId],
  });
  return admin.rows[0] as unknown as UserRow;
}
