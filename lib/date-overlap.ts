export function isOutOnDate(
  startDate: string,
  endDate: string,
  onDate: string
): boolean {
  return startDate <= onDate && endDate >= onDate;
}
