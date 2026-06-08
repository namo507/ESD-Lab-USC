import styles from "./Segmented.module.css";

export type SegmentedOption<T extends string> = T | { value: T; label: string };

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
}: SegmentedProps<T>) {
  const values = options.map((o) => (typeof o === "object" ? o.value : o) as T);
  const activeIndex = Math.max(0, values.indexOf(value));
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`${styles.wrap} ${styles[`s-${size}`]}`}>
      {options.map((o) => {
        const v = (typeof o === "object" ? o.value : o) as T;
        const lbl = typeof o === "object" ? o.label : o;
        const active = v === value;
        return (
          <button
            key={v}
            role="radio"
            aria-checked={active}
            type="button"
            onClick={() => onChange(v)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const offset = event.key === "ArrowRight" ? 1 : -1;
              const next = values[(activeIndex + offset + values.length) % values.length];
              if (next) onChange(next);
            }}
            className={`${styles.btn} ${active ? styles.active : ""}`}
          >
            {lbl}
          </button>
        );
      })}
    </div>
  );
}
