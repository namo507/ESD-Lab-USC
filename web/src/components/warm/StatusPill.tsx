interface Props {
  status: string;
}

const STATUS_MAP: Record<string, { label: string; dot: string }> = {
  visit_complete:    { label: "visit complete",   dot: "var(--sage)" },
  awaiting_feedback: { label: "awaiting feedback", dot: "var(--sand)" },
  redcap_synced:    { label: "REDCap synced",     dot: "var(--ocean)" },
  qa_review:         { label: "QA review",         dot: "var(--amber-warn)" },
  feedback_sent:     { label: "feedback sent",     dot: "var(--usc-garnet)" },
  pass:              { label: "pass",              dot: "var(--sage)" },
  pending:           { label: "pending",           dot: "var(--sand)" },
  reject:            { label: "reject",            dot: "var(--red)" },
};

export function StatusPill({ status }: Props) {
  const m = STATUS_MAP[status] ?? { label: status, dot: "var(--warm-fg4)" };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[color:var(--warm-pill)] rounded-full text-[11px] text-[color:var(--warm-fg2)] border border-[color:var(--warm-border)]">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} aria-hidden />
      {m.label}
    </span>
  );
}
