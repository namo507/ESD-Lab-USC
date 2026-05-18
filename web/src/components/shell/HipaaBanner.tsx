import { Icon, Gloss } from "@/components/primitives";

interface HipaaBannerProps {
  onDismiss?: () => void;
  idleMinutes: number;
}

/**
 * Gradient HIPAA banner per the warm design package. Inline `Gloss`
 * tooltips on PHI / HIPAA / REDCap pull definitions from `glossary.ts`.
 */
export function HipaaBanner({ onDismiss, idleMinutes }: HipaaBannerProps) {
  return (
    <div
      className="flex items-center gap-3 px-8 py-2 text-[12px] text-[color:var(--usc-garnet-800)] font-sans"
      style={{
        background: "linear-gradient(90deg, rgba(115,0,10,0.08) 0%, rgba(115,0,10,0.02) 100%)",
        borderBottom: "1px solid rgba(115,0,10,0.15)",
      }}
      role="region"
      aria-label="HIPAA notice"
    >
      <span aria-hidden>⚠️</span>
      <Icon name="shield-check" size={14} stroke={1.5} color="var(--usc-garnet)" />
      <span>
        <Gloss term="PHI">PHI</Gloss> processing zone ·{" "}
        <Gloss term="HIPAA">HIPAA</Gloss>-compliant audit logging is active. All exports are stripped of
        identifiers via <Gloss term="RedCap">REDCap</Gloss> proxy; LM Studio prompts are PHI-scrubbed
        before they leave the browser.
      </span>
      <span className="ml-auto font-mono text-[10px] text-[color:var(--warm-fg4)]">
        IRB Pro00115234 · session · {idleMinutes} m
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="bg-transparent border-0 p-1 cursor-pointer leading-none"
          aria-label="Dismiss HIPAA banner"
        >
          <Icon name="x" size={13} stroke={1.5} color="var(--warm-fg4)" />
        </button>
      )}
    </div>
  );
}
