import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, SectionLabel } from "@/components/primitives";

interface InsightSectionProps {
  label: string;
  title: string;
  description: string;
  learnMoreTo: string;
  children: ReactNode;
}

export function InsightSection({ label, title, description, learnMoreTo, children }: InsightSectionProps) {
  return (
    <Card pad={20}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <SectionLabel>{label}</SectionLabel>
          <h2 style={{ margin: "4px 0", fontFamily: "var(--font-serif)", fontSize: 24, color: "var(--ink)" }}>{title}</h2>
          <p style={{ margin: 0, color: "var(--slate-500)", fontSize: 16, lineHeight: 1.5 }}>{description}</p>
        </div>
        <Link to={learnMoreTo} style={{ color: "var(--usc-garnet)", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
          Learn more
        </Link>
      </div>
      {children}
    </Card>
  );
}
