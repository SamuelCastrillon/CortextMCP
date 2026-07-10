import { requireAdmin } from '@/modules/panel/auth';
import { SettingsForm } from '@/modules/panel/components/SettingsForm';

export default async function AdminSettingsPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Instance-wide configuration settings.</p>
      </div>

      <SettingsForm />
    </div>
  );
}
