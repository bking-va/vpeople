export function raiseCutoffDate(asOf: Date = new Date(), months = 12): string {
  const d = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - months, asOf.getUTCDate())
  );
  return d.toISOString().slice(0, 10);
}

export function isRaiseOverdue(lastEffectiveDate: string | null, cutoff: string): boolean {
  return !lastEffectiveDate || lastEffectiveDate < cutoff;
}
