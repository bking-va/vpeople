export function isBambooImportedTimeOff(request: {
  bambooId?: string | null;
}): boolean {
  return Boolean(request.bambooId?.trim());
}
