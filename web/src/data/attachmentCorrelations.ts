export interface AttachmentCorrelation {
  row: string;
  column: string;
  r: number;
  p: number;
}

export const ATTACHMENT_DOMAINS = [
  "Secure-base script",
  "Caregiver sensitivity",
  "Still-face recovery",
  "RSA regulation",
  "HDA sustained attention",
  "Social communication",
] as const;

export const ATTACHMENT_CORRELATIONS: AttachmentCorrelation[] = ATTACHMENT_DOMAINS.flatMap((row, ri) =>
  ATTACHMENT_DOMAINS.map((column, ci) => {
    const same = ri === ci;
    const distance = Math.abs(ri - ci);
    const sign = ri <= ci ? 1 : -1;
    return {
      row,
      column,
      r: same ? 1 : Number((sign * (0.58 - distance * 0.08)).toFixed(2)),
      p: same ? 0 : Number((0.004 + distance * 0.018).toFixed(3)),
    };
  }),
);
