export function formatHuf(value: unknown, withCurrency = true): string {
  let raw = typeof value === "string" ? value.trim() : String(value ?? "");
  raw = raw.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    raw = raw.replace(/\./g, "");
  }
  const n = typeof value === "number" ? value : Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n);
  const grouped = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return withCurrency ? `${grouped} Ft` : grouped;
}
