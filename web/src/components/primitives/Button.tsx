import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconRight?: string;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  children,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const cls = [
    styles.btn,
    styles[`v-${variant}`],
    styles[`s-${size}`],
    disabled ? styles.disabled : "",
    className ?? "",
  ].join(" ").trim();
  return (
    <button {...rest} className={cls} disabled={disabled} type={rest.type ?? "button"}>
      {icon && <Icon name={icon} size={size === "lg" ? 15 : 14} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "lg" ? 15 : 14} />}
    </button>
  );
}
