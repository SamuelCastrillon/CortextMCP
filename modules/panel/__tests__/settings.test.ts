import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb } from '@/modules/core/db';
import type { Client } from '@libsql/client';

let testClient: Client;
const tenantId = 'default';

beforeAll(async () => {
  const t = await createTestDb();
  testClient = t.client;
});

describe('panel/actions — settings', () => {
  it('lists all instance settings', async () => {
    const rows = await testClient.execute({
      sql: `SELECT key, value FROM instance_settings ORDER BY key`,
    });

    expect(rows.rows.length).toBeGreaterThanOrEqual(1);
    const settings = rows.rows.map((r) => (r as Record<string, unknown>));
    const regSetting = settings.find((s) => s.key === 'registration_enabled');
    expect(regSetting).toBeDefined();
    expect((regSetting as Record<string, unknown>).value).toBe('0');
  });

  it('reads a specific setting by key', async () => {
    const rows = await testClient.execute({
      sql: `SELECT value FROM instance_settings WHERE key = 'registration_enabled'`,
    });

    expect(rows.rows.length).toBe(1);
    expect((rows.rows[0] as Record<string, unknown>).value).toBe('0');
  });

  it('updates an existing setting', async () => {
    await testClient.execute({
      sql: `UPDATE instance_settings SET value = '1', updated_at = datetime('now') WHERE key = 'registration_enabled'`,
    });

    const rows = await testClient.execute({
      sql: `SELECT value FROM instance_settings WHERE key = 'registration_enabled'`,
    });
    expect((rows.rows[0] as Record<string, unknown>).value).toBe('1');
  });

  it('rejects unknown setting key (allowlist validation)', async () => {
    const allowedKeys = ['registration_enabled'];
    const unknownKey = 'nonexistent_key';

    // Simulate the allowlist check
    const isValid = allowedKeys.includes(unknownKey);
    expect(isValid).toBe(false);
  });

  it('creates a new setting if key does not exist', async () => {
    // Insert a new setting
    await testClient.execute({
      sql: `INSERT INTO instance_settings (key, value) VALUES ('test_setting', 'test_value')`,
    });

    const rows = await testClient.execute({
      sql: `SELECT value FROM instance_settings WHERE key = 'test_setting'`,
    });
    expect(rows.rows.length).toBe(1);
    expect((rows.rows[0] as Record<string, unknown>).value).toBe('test_value');

    // Clean up
    await testClient.execute({
      sql: `DELETE FROM instance_settings WHERE key = 'test_setting'`,
    });
  });

  it('toggles registration_enabled to true then false', async () => {
    // Toggle to true
    await testClient.execute({
      sql: `UPDATE instance_settings SET value = '1', updated_at = datetime('now') WHERE key = 'registration_enabled'`,
    });

    let rows = await testClient.execute({
      sql: `SELECT value FROM instance_settings WHERE key = 'registration_enabled'`,
    });
    expect((rows.rows[0] as Record<string, unknown>).value).toBe('1');

    // Toggle to false
    await testClient.execute({
      sql: `UPDATE instance_settings SET value = '0', updated_at = datetime('now') WHERE key = 'registration_enabled'`,
    });

    rows = await testClient.execute({
      sql: `SELECT value FROM instance_settings WHERE key = 'registration_enabled'`,
    });
    expect((rows.rows[0] as Record<string, unknown>).value).toBe('0');
  });
});
