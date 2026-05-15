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
            className={`${styles.btn} ${active ? styles.active : ""}`}
          >
            {lbl}
          </button>
        );
      })}
    </div>
  );
}
