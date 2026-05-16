import { Settings as SettingsIcon } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { ThemeSelect } from "@/frontend/components/ui/theme-toggle";
import { SocialHandlesCard } from "@/frontend/components/app/social-handles-card";
import type { CmoVoiceProfile } from "@/backend/agents/cmo-data";
import { WorkspaceSettingsForm } from "./form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { workspace, user } = await requireWorkspace();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspace and profile configuration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <div className="text-muted-foreground">Name</div>
              <div className="font-medium">{user.name || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Email</div>
              <div className="font-medium">{user.email}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkspaceSettingsForm
            key={workspace.updatedAt.toISOString()}
            workspace={{
              name: workspace.name,
              websiteUrl: workspace.websiteUrl,
              industry: workspace.industry,
              icp: workspace.icp,
            }}
          />
        </CardContent>
      </Card>

      <SocialHandlesCard
        initial={
          ((workspace.voiceProfile as CmoVoiceProfile | null)?.socialHandles ?? {}) as Record<string, string>
        }
        hasWebsiteUrl={!!workspace.websiteUrl}
      />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-muted-foreground">
              Pick light, dark (purple-black), or follow system.
            </p>
          </div>
          <ThemeSelect />
        </CardContent>
      </Card>
    </div>
  );
}
