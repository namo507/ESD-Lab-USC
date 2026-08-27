import { Badge, Card, SectionLabel } from "@/components/primitives";
import type { CountyProfileRow } from "@/api/schemas";

interface CountyCardProps {
  profile: CountyProfileRow | undefined;
  side: "left" | "right";
}

function pct(value: number | undefined): string {
  return `${(((value ?? 0) as number) * 100).toFixed(1)}%`;
}

export function CountyCard({ profile, side }: CountyCardProps) {
  if (!profile) {
    return (
      <Card pad={16}>
        <SectionLabel>{side} county</SectionLabel>
        <p style={{ margin: 0, color: "var(--slate-500)", fontSize: 13 }}>No county profile available.</p>
      </Card>
    );
  }

  return (
    <Card pad={16} dataInsight="county-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <SectionLabel>{side} county</SectionLabel>
          <h3 style={{ margin: "4px 0 0", fontFamily: "var(--font-serif)", fontSize: 22, color: "var(--ink)" }}>
            {profile.county}
          </h3>
          <div className="t-mono" style={{ color: "var(--slate-500)", fontSize: 11 }}>FIPS {profile.fips}</div>
        </div>
        <Badge kind={profile.sdohScore > 0.48 ? "warn" : "info"} size="sm">
          {profile.medianIncomeBracket} income proxy
        </Badge>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
        {[
          ["Enrolled", profile.enrolled.toLocaleString()],
          ["Completion", pct(profile.completionRate)],
          ["SDoH score", profile.sdohScore.toFixed(2)],
          ["CPTd gap", profile.cptdGapMean == null ? "n/a" : `${profile.cptdGapMean.toFixed(1)} C`],
        ].map(([label, value]) => (
          <div
            key={label}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--r-2)",
              padding: "10px 12px",
              background: "var(--bg-subtle)",
            }}
          >
            <div style={{ color: "var(--slate-500)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
            <div className="t-mono" style={{ marginTop: 3, fontWeight: 700, color: "var(--ink)" }}>{value}</div>
          </div>
        ))}
      </div>

      {profile.cptdGapMean != null && (
        <p style={{ margin: "12px 0 0", color: "var(--slate-500)", fontSize: 12, lineHeight: 1.5 }}>
          CPTd context is shown as an aggregate county-level physiology proxy, not as an individual-family signal.
        </p>
      )}
    </Card>
  );
}
