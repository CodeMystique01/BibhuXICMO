import { AGENTS } from "@/frontend/data/marketing-data";
import { SITE_NAME } from "@/shared/site";
import { Badge } from "@/frontend/components/ui/badge";
import { cn } from "@/shared/utils";

export function AgentGrid() {
  return (
    <section id="agents" className="py-24 md:py-32">
      <div className="container">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-primary">
            Your AI marketing team
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            Everything a marketing team does,
            <br />
            <span className="text-muted-foreground">handled for you.</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            You stay in control. {SITE_NAME} does the heavy lifting.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((agent) => {
            const Icon = agent.icon;
            return (
              <article
                key={agent.id}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-lg",
                  agent.status === "soon" && "opacity-75"
                )}
              >
                <div
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br opacity-50 transition-opacity group-hover:opacity-100",
                    agent.accent
                  )}
                />
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/80 text-primary shadow-sm ring-1 ring-border">
                    <Icon className="h-5 w-5" />
                  </div>
                  {agent.status === "soon" && (
                    <Badge variant="outline" className="text-[10px]">
                      Coming soon
                    </Badge>
                  )}
                </div>
                <h3 className="text-base font-semibold">{agent.name}</h3>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                  {agent.tagline}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {agent.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
