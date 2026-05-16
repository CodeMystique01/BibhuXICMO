import { requireWorkspace } from "@/backend/workspace";
import { getBalance } from "@/backend/credits";
import { AppShell } from "@/frontend/components/app/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Keep the layout lean — only the data the chrome (sidebar/topbar) actually
  // needs to render. Notifications are fetched client-side from
  // /api/notifications so navigations between tabs don't pay a notification
  // query on every server render.
  const { user, workspace } = await requireWorkspace();
  const credits = await getBalance(workspace.id);
  const plan = workspace.subscription?.plan ?? "FREE";

  return (
    <AppShell
      user={user}
      workspaceName={workspace.name}
      workspaceId={workspace.id}
      plan={plan}
      credits={credits}
    >
      {children}
    </AppShell>
  );
}
