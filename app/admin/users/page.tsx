import { requireAdmin } from '@/modules/panel/auth';
import { createLibsqlClient, TENANT_ID } from '@/modules/core/db';
import { listUsersInternal } from '@/modules/panel/actions/users';
import { UsersList } from '@/modules/panel/components/UsersList';
import { UserForm } from '@/modules/panel/components/UserForm';

export default async function AdminUsersPage() {
  await requireAdmin();

  const client = createLibsqlClient();
  try {
    const users = await listUsersInternal(client, TENANT_ID());
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage instance users and their roles.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <UsersList initialUsers={users as any[]} />
          </div>
          <div>
            <UserForm />
          </div>
        </div>
      </div>
    );
  } finally {
    client.close();
  }
}
