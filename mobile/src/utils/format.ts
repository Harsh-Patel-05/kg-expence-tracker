export function formatRs(amount: number): string {
  const n = Math.round(amount);
  return `Rs ${n.toLocaleString('en-IN')}`;
}
