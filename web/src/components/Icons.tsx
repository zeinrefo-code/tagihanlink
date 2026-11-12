const base = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const CheckIcon = () => (
  <svg {...base}><path d="M5 12l5 5L20 7" /></svg>
);
export const WarnIcon = () => (
  <svg {...base}><path d="M12 7v6" /><path d="M12 17h.01" /></svg>
);
export const CrossIcon = () => (
  <svg {...base}><path d="M7 7l10 10M17 7L7 17" /></svg>
);
