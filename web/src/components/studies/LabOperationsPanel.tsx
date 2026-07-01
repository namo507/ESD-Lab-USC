import { Badge, Button, Card, SectionLabel } from "@/components/primitives";
import { useStudyData, type LabOperationsData } from "@/api/studyData";
import { useUi } from "@/store/ui";

function statusKind(status: string): "ok" | "pending" | "neutral" | "info" {
  const normalized = status.toLowerCase();
  if (normalized === "active" || normalized === "live") return "ok";
  if (normalized === "next" || normalized === "planned") return "pending";
  if (normalized.includes("primary")) return "info";
  return "neutral";
}

function openBuddyPrompt(prompt: string) {
  const { setChatSeed, setChatOpen } = useUi.getState();
  setChatSeed(prompt);
  setChatOpen(true);
}

function CompactList({ items, limit = 3 }: { items: string[]; limit?: number }) {
  return (
    <ul className="m-0 mt-2 flex flex-col gap-1.5 p-0 list-none">
      {items.slice(0, limit).map((item) => (
        <li key={item} className="text-[12px] leading-snug text-[color:var(--warm-fg3)]">
          <span className="mr-2 text-[color:var(--usc-garnet)]" aria-hidden>
            -
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

function StatTile({ label, value, body }: { label: string; value: string; body: string }) {
  return (
    <div className="min-w-0 rounded-[var(--r-card)] border border-[color:var(--warm-border)] bg-[color:var(--bg-subtle)] p-3.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">
        {label}
      </div>
      <div className="mt-1 font-serif text-[17px] font-semibold leading-tight text-[color:var(--warm-fg1)]">
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-snug text-[color:var(--warm-fg3)]">{body}</div>
    </div>
  );
}

export function LabOperationsPanelContent({ operations }: { operations: LabOperationsData }) {
  const active = useUi((s) => s.activeStudy);
  const phases = operations.workflow_phases;
  const activePhase = phases.find((phase) => phase.status === "active") ?? phases[0];
  const nanoDoc = operations.source_documents.find((doc) => doc.study === "NANO");
  const nicoDoc = operations.source_documents.find((doc) => doc.study === "NICO");

  return (
    <section aria-label="Lab operations workflow" data-tour="lab-operations">
      <Card pad={20} dataInsight="lab-ops-priority">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-[760px]">
            <SectionLabel>Operational rollout</SectionLabel>
            <div className="mt-1 font-serif text-[22px] font-semibold leading-tight text-[color:var(--warm-fg1)]">
              Nano-first lab workflow, with Nico kept in view
            </div>
            <p className="mt-2 max-w-[720px] text-[13px] leading-relaxed text-[color:var(--warm-fg3)]">
              {operations.priority.primary_objective} {operations.priority.secondary_objective}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge kind="info" mono>NANO primary</Badge>
            <Badge kind="neutral" mono>NICO secondary</Badge>
            <Badge kind="pending" mono>{activePhase?.timeframe ?? "Weeks 1-2"}</Badge>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-3 max-[1200px]:grid-cols-2 max-[640px]:grid-cols-1">
          <StatTile
            label="Current priority"
            value="Nano grant data"
            body={operations.priority.current_priority}
          />
          <StatTile
            label="Decision cadence"
            value="Sam + Dr. Bradshaw"
            body={operations.priority.decision_dependency}
          />
          <StatTile
            label="Study docs"
            value={`${nanoDoc?.pages ?? 107} + ${nicoDoc?.pages ?? 105} pages`}
            body={`${nanoDoc?.award ?? "R01MH132925"} prioritized; ${nicoDoc?.award ?? "R01MH138028"} staged next.`}
          />
          <StatTile
            label="Active scope"
            value={active === "BOTH" ? "Both studies" : active}
            body={operations.priority.scope_guardrail}
          />
        </div>

        <div className="mt-5 grid grid-cols-[1.2fr_0.8fr] gap-4 max-[1100px]:grid-cols-1">
          <div data-insight="lab-ops-workflow">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">
                  Four-phase workflow
                </div>
                <div className="mt-1 text-[13px] text-[color:var(--warm-fg3)]">
                  From observation to multi-grant integration, paced around staff capacity.
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon="sparkles"
                onClick={() => openBuddyPrompt("Summarize the Nano-first rollout plan and current phase.")}
              >
                Ask Buddy
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
              {phases.map((phase) => (
                <article
                  key={phase.id}
                  className="rounded-[var(--r-card)] border border-[color:var(--warm-border)] bg-[color:var(--bg-subtle)] p-4"
                  data-insight="lab-ops-phase"
                  data-insight-term={phase.phase}
                  data-insight-body={`${phase.timeframe}: ${phase.study_focus}. Outputs: ${phase.outputs.join(", ")}.`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-serif text-[16px] font-semibold leading-tight text-[color:var(--warm-fg1)]">
                        {phase.phase}
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-[color:var(--warm-fg4)]">
                        {phase.timeframe}
                      </div>
                    </div>
                    <Badge kind={statusKind(phase.status)} size="sm" mono>
                      {phase.status}
                    </Badge>
                  </div>
                  <div className="mt-2 text-[12px] font-semibold text-[color:var(--warm-fg2)]">
                    {phase.study_focus}
                  </div>
                  <CompactList items={phase.tasks} />
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {phase.outputs.map((output) => (
                      <Badge key={output} kind="neutral" size="sm">
                        {output}
                      </Badge>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div
              className="rounded-[var(--r-card)] border border-[color:var(--warm-border)] bg-[color:var(--bg-subtle)] p-4"
              data-insight="lab-ops-roles"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">
                    Role handoffs
                  </div>
                  <div className="mt-1 font-serif text-[16px] font-semibold text-[color:var(--warm-fg1)]">
                    Who owns what
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="message-square"
                  onClick={() => openBuddyPrompt("What should coordinators, grad students, and undergrads each own?")}
                >
                  Ask
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {operations.role_workflows.map((role) => (
                  <div key={role.role} className="border-t border-[color:var(--warm-border)] pt-2 first:border-0 first:pt-0">
                    <div className="text-[12px] font-semibold text-[color:var(--warm-fg1)]">{role.role}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-[color:var(--warm-fg3)]">{role.focus}</div>
                    <div className="mt-1 text-[11px] leading-snug text-[color:var(--warm-fg4)]">
                      Handoff: {role.handoff}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="rounded-[var(--r-card)] border border-[color:var(--warm-border)] bg-[color:var(--bg-subtle)] p-4"
              data-insight="lab-ops-metrics"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">
                Aligned metrics
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {operations.draft_metrics.slice(0, 5).map((metric) => (
                  <div key={metric.name} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-[color:var(--warm-fg1)]">{metric.name}</div>
                      <div className="text-[11px] leading-snug text-[color:var(--warm-fg3)]">{metric.definition}</div>
                    </div>
                    <Badge kind={statusKind(metric.status)} size="sm" mono>
                      {metric.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_1fr] gap-3 max-[900px]:grid-cols-1">
          <div
            className="rounded-[var(--r-card)] border border-[color:var(--warm-border)] bg-[color:var(--bg-subtle)] p-4"
            data-insight="lab-ops-surface-status"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">
              Current dashboard status
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 max-[680px]:grid-cols-1">
              {operations.dashboard_surface_status.map((surface) => (
                <div key={surface.area} className="rounded-md border border-[color:var(--warm-border)] bg-[color:var(--warm-card)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-[color:var(--warm-fg1)]">{surface.area}</span>
                    <Badge kind={statusKind(surface.status)} size="sm" mono>{surface.status}</Badge>
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-[color:var(--warm-fg3)]">{surface.shown}</div>
                  <div className="mt-1 text-[11px] leading-snug text-[color:var(--warm-fg4)]">Next: {surface.next_need}</div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-[var(--r-card)] border border-[color:var(--warm-border)] bg-[color:var(--bg-subtle)] p-4"
            data-insight="lab-ops-family"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">
              Guardrails and daily routine
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 max-[680px]:grid-cols-1">
              {operations.daily_routine.map((block) => (
                <div key={block.block} className="rounded-md border border-[color:var(--warm-border)] bg-[color:var(--warm-card)] p-3">
                  <div className="text-[12px] font-semibold text-[color:var(--warm-fg1)]">{block.block}</div>
                  <div className="mt-1 text-[11px] leading-snug text-[color:var(--warm-fg3)]">{block.purpose}</div>
                </div>
              ))}
            </div>
            <CompactList items={operations.rollout_controls} limit={4} />
            <div className="mt-3 rounded-md bg-[color:var(--warm-pill)] p-3 text-[12px] leading-snug text-[color:var(--warm-fg2)]">
              <strong className="text-[color:var(--warm-fg1)]">Family-facing status:</strong>{" "}
              {operations.family_data_sharing.near_term_policy} {operations.family_data_sharing.future_option}
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

export function LabOperationsPanel() {
  const { data, isLoading, isError } = useStudyData();

  if (isLoading || isError || !data?.lab_operations) return null;
  return <LabOperationsPanelContent operations={data.lab_operations} />;
}
