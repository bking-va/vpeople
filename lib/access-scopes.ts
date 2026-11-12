import type { AccessLevel } from "@/lib/authz";
import { isFullAdmin } from "@/lib/authz";

export type AccessScopeRow = {
  locationId: number | null;
  country: string | null;
};

export type AccessScopeViewer = {
  employeeId: number;
  accessLevel: AccessLevel;
  canManageUsers?: boolean;
};

export function canSeeAllEmployees(viewer: AccessScopeViewer): boolean {
  return (
    isFullAdmin(viewer.accessLevel) ||
    viewer.canManageUsers === true ||
    viewer.accessLevel === "global_view"
  );
}

export function normalizeCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export function employeeMatchesAccessScope(
  employee: { locationId: number | null; country: string | null },
  scopes: AccessScopeRow[]
): boolean {
  if (!scopes.length) return false;
  const country = normalizeCountry(employee.country);
  for (const scope of scopes) {
    if (scope.locationId != null && employee.locationId === scope.locationId) {
      return true;
    }
    const scopeCountry = normalizeCountry(scope.country);
    if (scopeCountry && country && scopeCountry === country) {
      return true;
    }
  }
  return false;
}

export function canManageAccessScopes(viewer: AccessScopeViewer): boolean {
  return isFullAdmin(viewer.accessLevel) || viewer.canManageUsers === true;
}

export function visibleRelatedEmployeeName(
  relatedId: number | null | undefined,
  name: { firstName?: string | null; lastName?: string | null },
  allowed: Set<number> | "all"
): string {
  if (relatedId == null) return "";
  if (allowed !== "all" && !allowed.has(relatedId)) return "";
  if (!name.firstName || !name.lastName) return "";
  return `${name.firstName} ${name.lastName}`;
}
