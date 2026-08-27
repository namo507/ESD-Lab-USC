import { Card, SectionLabel } from "@/components/primitives";

export function ShapExplainerCard() {
  return (
    <Card pad={18} dataInsight="model-terrain-explainer">
      <SectionLabel>How to read it</SectionLabel>
      <h3 style={{ margin: "4px 0 8px", fontFamily: "var(--font-serif)", fontSize: 20, color: "var(--ink)" }}>
        Higher terrain means stronger model influence.
      </h3>
      <p style={{ margin: 0, color: "var(--slate-500)", fontSize: 13, lineHeight: 1.55 }}>
        Use this chart to find where the model listens hardest in developmental time. SHAP values explain model behavior, not causality, and should be interpreted alongside study design and validation metrics.
      </p>
    </Card>
  );
}
