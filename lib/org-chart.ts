/** CEO plus direct reports; deeper levels stay collapsed until expanded. */
export const ORG_CHART_DEFAULT_EXPANDED_DEPTH = 1;

export type OrgChartEmployee = {
  id: number;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  jobTitle: string | null;
  email: string;
  managerId: number | null;
  employmentStatus: string;
};

export type OrgChartOrphanReason =
  | "no_manager"
  | "manager_not_current"
  | "cycle";

export type OrgChartNode = {
  id: number;
  name: string;
  jobTitle: string | null;
  email: string;
  orphanReason: OrgChartOrphanReason | null;
  children: OrgChartNode[];
};

export type OrgChartForest = {
  ceo: OrgChartNode | null;
  unmanaged: OrgChartNode[];
  currentCount: number;
  unmanagedCount: number;
};

export function isCurrentEmploymentStatus(status: string): boolean {
  return status !== "terminated";
}

export function isCeoJobTitle(jobTitle: string | null | undefined): boolean {
  if (!jobTitle) return false;
  const normalized = jobTitle.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (!normalized) return false;
  if (normalized.includes("chief executive officer")) return true;
  const tokens = normalized.split(" ");
  if (
    tokens.includes("assistant") ||
    tokens.includes("deputy") ||
    tokens.includes("office")
  ) {
    return false;
  }
  return tokens.includes("ceo");
}

export function employeeDisplayName(emp: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}): string {
  return emp.preferredName
    ? `${emp.preferredName} ${emp.lastName}`
    : `${emp.firstName} ${emp.lastName}`;
}

export function orphanReasonLabel(reason: OrgChartOrphanReason): string {
  switch (reason) {
    case "no_manager":
      return "No manager";
    case "manager_not_current":
      return "Manager not in vPeople";
    case "cycle":
      return "Reporting cycle";
  }
}

/**
 * Build a current-employee org chart with the CEO as the single apex.
 *
 * The old page treated every missing/former manager as an equal root and
 * rendered that forest in query order, so after the Bamboo import the CEO
 * was no longer at the top. People whose chain does not reach the CEO are
 * kept in a separate unmanaged forest — never dropped, never given a
 * fabricated manager.
 */
export function buildOrgChart(employees: OrgChartEmployee[]): OrgChartForest {
  const current = employees.filter((emp) =>
    isCurrentEmploymentStatus(emp.employmentStatus)
  );
  const byId = new Map(current.map((emp) => [emp.id, emp]));
  const parentOf = new Map<number, number | null>();
  const linkReason = new Map<number, OrgChartOrphanReason | null>();

  for (const emp of current) {
    const classified = classifyManagerLink(emp, byId);
    parentOf.set(emp.id, classified.parentId);
    linkReason.set(emp.id, classified.reason);
  }

  const titled = current.filter((emp) => isCeoJobTitle(emp.jobTitle));
  let ceoId = titled.length > 0 ? pickTitledCeo(titled) : null;
  if (ceoId != null) parentOf.set(ceoId, null);

  const cycleIds = breakCycles(parentOf);
  for (const id of cycleIds) {
    if (parentOf.get(id) == null && linkReason.get(id) == null) {
      linkReason.set(id, "cycle");
    }
  }

  const childrenByParent = adjacency(parentOf);
  if (ceoId == null) {
    ceoId = pickLargestRoot(current, parentOf, childrenByParent);
    if (ceoId != null) parentOf.set(ceoId, null);
  }

  const forestChildren = adjacency(parentOf);
  const ceo =
    ceoId == null
      ? null
      : toNode(ceoId, byId, forestChildren, linkReason, /* unmanaged */ false);

  const inCeoTree = new Set<number>();
  if (ceo) collectIds(ceo, inCeoTree);

  const unmanagedRoots = current
    .filter((emp) => !inCeoTree.has(emp.id) && parentOf.get(emp.id) == null)
    .sort(compareEmployees)
    .map((emp) =>
      toNode(emp.id, byId, forestChildren, linkReason, /* unmanaged */ true)
    );

  return {
    ceo,
    unmanaged: unmanagedRoots,
    currentCount: current.length,
    unmanagedCount: current.length - inCeoTree.size,
  };
}

function classifyManagerLink(
  emp: OrgChartEmployee,
  currentById: Map<number, OrgChartEmployee>
): { parentId: number | null; reason: OrgChartOrphanReason | null } {
  if (emp.managerId == null) {
    return { parentId: null, reason: "no_manager" };
  }
  if (emp.managerId === emp.id) {
    return { parentId: null, reason: "cycle" };
  }
  if (!currentById.has(emp.managerId)) {
    return { parentId: null, reason: "manager_not_current" };
  }
  return { parentId: emp.managerId, reason: null };
}

function breakCycles(parentOf: Map<number, number | null>): Set<number> {
  const cycleIds = new Set<number>();
  const ids = [...parentOf.keys()].sort((a, b) => a - b);

  for (const start of ids) {
    const seen: number[] = [];
    const inPath = new Set<number>();
    let current: number | null = start;
    while (current != null) {
      if (inPath.has(current)) {
        const prev = seen[seen.length - 1];
        if (prev != null) parentOf.set(prev, null);
        const cycleStart = seen.indexOf(current);
        for (const id of seen.slice(cycleStart)) cycleIds.add(id);
        break;
      }
      inPath.add(current);
      seen.push(current);
      current = parentOf.get(current) ?? null;
    }
  }

  return cycleIds;
}

function adjacency(parentOf: Map<number, number | null>): Map<number, number[]> {
  const children = new Map<number, number[]>();
  for (const id of parentOf.keys()) children.set(id, []);
  for (const [id, parent] of parentOf) {
    if (parent == null) continue;
    const list = children.get(parent);
    if (list) list.push(id);
  }
  return children;
}

function ceoTitleRank(jobTitle: string | null | undefined): number {
  if (!jobTitle) return 0;
  const normalized = jobTitle.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (normalized.includes("chief executive officer")) return 2;
  return 1;
}

function pickTitledCeo(titled: OrgChartEmployee[]): number {
  return [...titled].sort((a, b) => {
    const rank = ceoTitleRank(b.jobTitle) - ceoTitleRank(a.jobTitle);
    if (rank !== 0) return rank;
    const aRoot = a.managerId == null ? 0 : 1;
    const bRoot = b.managerId == null ? 0 : 1;
    if (aRoot !== bRoot) return aRoot - bRoot;
    return a.id - b.id;
  })[0].id;
}

function pickLargestRoot(
  current: OrgChartEmployee[],
  parentOf: Map<number, number | null>,
  childrenByParent: Map<number, number[]>
): number | null {
  if (current.length === 0) return null;
  const sizeMemo = new Map<number, number>();
  const sizeOf = (id: number) => subtreeSize(id, childrenByParent, sizeMemo);
  const roots = current.filter((emp) => parentOf.get(emp.id) == null);
  const pool = roots.length > 0 ? roots : current;
  return [...pool].sort((a, b) => sizeOf(b.id) - sizeOf(a.id) || a.id - b.id)[0]
    .id;
}

function subtreeSize(
  id: number,
  childrenByParent: Map<number, number[]>,
  memo: Map<number, number>,
  visiting = new Set<number>()
): number {
  const cached = memo.get(id);
  if (cached != null) return cached;
  if (visiting.has(id)) return 1;
  visiting.add(id);
  let size = 1;
  for (const child of childrenByParent.get(id) ?? []) {
    size += subtreeSize(child, childrenByParent, memo, visiting);
  }
  visiting.delete(id);
  memo.set(id, size);
  return size;
}

function toNode(
  id: number,
  byId: Map<number, OrgChartEmployee>,
  childrenByParent: Map<number, number[]>,
  linkReason: Map<number, OrgChartOrphanReason | null>,
  unmanaged: boolean
): OrgChartNode {
  const emp = byId.get(id)!;
  const childIds = [...(childrenByParent.get(id) ?? [])].sort((a, b) =>
    compareEmployees(byId.get(a)!, byId.get(b)!)
  );
  return {
    id: emp.id,
    name: employeeDisplayName(emp),
    jobTitle: emp.jobTitle,
    email: emp.email,
    orphanReason: unmanaged ? linkReason.get(id) ?? "no_manager" : null,
    children: childIds.map((childId) =>
      toNode(childId, byId, childrenByParent, linkReason, false)
    ),
  };
}

function collectIds(node: OrgChartNode, into: Set<number>) {
  into.add(node.id);
  for (const child of node.children) collectIds(child, into);
}

function compareEmployees(a: OrgChartEmployee, b: OrgChartEmployee): number {
  const last = a.lastName.localeCompare(b.lastName);
  if (last !== 0) return last;
  const first = a.firstName.localeCompare(b.firstName);
  if (first !== 0) return first;
  return a.id - b.id;
}
