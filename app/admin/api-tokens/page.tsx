import { requireAdmin } from '@/modules/panel/auth';
import { createLibsqlClient, TENANT_ID } from '@/modules/core/db';
import { listTokensInternal } from '@/modules/panel/actions/tokens';
import { ApiTokensList } from '@/modules/panel/components/ApiTokensList';

export default async function AdminApiTokensPage() {
  await requireAdmin();

  const client = createLibsqlClient();
  try {
    const tokens = await listTokensInternal(client, TENANT_ID());
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">API Tokens</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage API tokens for external integrations.</p>
        </div>

        <ApiTokensList initialTokens={tokens as any[]} />
      </div>
    );
  } finally {
    client.close();
  }
}
