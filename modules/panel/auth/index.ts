import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type Client } from '@libsql/client';
import { createLibsqlClient } from '@/modules/core/db';

/**
 * Result type for all admin panel server actions.
 * Success: `{ success: true, data?: unknown }`
 * Error:   `{ success: false, error: string }`
 */
export type ActionResult =
  | { success: true; data?: unknown }
  | { success: false; error: string };

/**
 * Derive the JWT secret from the JWT_SECRET env var.
 * Throws if unset — no fallback to avoid silent auth bypass in production.
 */
function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error(
      'JWT_SECRET environment variable is required. ' +
        'Set it in .env or the deployment environment to a random 32+ char string.',
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Create a JWT session token with 15-minute expiry.
 * Used for admin panel authentication.
 */
export async function createSessionToken(payload: {
  userId: number;
  role: string;
}): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret());
}

/**
 * Verify and decode a JWT session token.
 * Returns null if the token is invalid, expired, or malformed.
 */
export async function verifySessionToken(
  token: string,
): Promise<{ userId: number; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    });
    const userId = payload.userId as number | undefined;
    const role = payload.role as string | undefined;
    if (typeof userId !== 'number' || typeof role !== 'string') return null;
    return { userId, role };
  } catch {
    return null;
  }
}

/**
 * Admin-role guard for panel pages and server actions.
 * Reads the session cookie, verifies the JWT, and checks `role === 'admin'`.
 * Redirects to `/admin/login` on any failure.
 * Returns `{ userId }` on success.
 */
export async function requireAdmin(): Promise<{ userId: number }> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;

  if (!sessionCookie) {
    redirect('/admin/login');
  }

  const session = await verifySessionToken(sessionCookie);
  if (!session || session.role !== 'admin') {
    redirect('/admin/login');
  }

  return { userId: session.userId };
}

/**
 * Wraps a server-action handler with admin guard, libSQL client lifecycle,
 * error logging, and consistent ActionResult formatting.
 *
 * Usage:
 *   export async function listThings(): Promise<ActionResult> {
 *     return withAdmin((client) => listThingsInternal(client));
 *   }
 *
 * The admin's userId is passed as the second arg for actions that need it:
 *   return withAdmin((client, uid) => createThingInternal(client, uid, ...));
 */
export async function withAdmin<T>(
  fn: (client: Client, userId: number) => Promise<T>,
): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    const client = createLibsqlClient();
    try {
      const data = await fn(client, userId);
      return { success: true, data } as ActionResult;
    } finally {
      client.close();
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
    console.error('[panel] action failed:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
