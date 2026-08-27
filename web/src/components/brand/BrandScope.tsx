import type { ReactNode } from "react";

interface BrandScopeProps {
  children: ReactNode;
}

export function BrandScope({ children }: BrandScopeProps) {
  return (
    <div className="esd-brand-scope" data-brand="esd-2026">
      {children}
    </div>
  );
}
