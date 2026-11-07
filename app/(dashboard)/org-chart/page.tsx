import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Users } from "lucide-react";

interface EmployeeNode {
  id: number;
  name: string;
  jobTitle: string | null;
  email: string;
  employeeNumber: string | null;
  managerId: number | null;
  children: EmployeeNode[];
}

async function buildOrgTree(): Promise<EmployeeNode[]> {
  const allEmployees = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      preferredName: employees.preferredName,
      jobTitle: employees.jobTitle,
      email: employees.email,
      employeeNumber: employees.employeeNumber,
      managerId: employees.managerId,
      employmentStatus: employees.employmentStatus,
    })
    .from(employees)
    .where(eq(employees.employmentStatus, "full_time"));

  const employeeMap = new Map<number, EmployeeNode>();
  const roots: EmployeeNode[] = [];

  for (const emp of allEmployees) {
    const name = emp.preferredName
      ? `${emp.preferredName} ${emp.lastName}`
      : `${emp.firstName} ${emp.lastName}`;

    employeeMap.set(emp.id, {
      id: emp.id,
      name,
      jobTitle: emp.jobTitle,
      email: emp.email,
      employeeNumber: emp.employeeNumber,
      managerId: emp.managerId,
      children: [],
    });
  }

  for (const node of employeeMap.values()) {
    if (node.managerId === null) {
      roots.push(node);
    } else {
      const parent = employeeMap.get(node.managerId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  return roots;
}

function OrgNode({ node, level = 0 }: { node: EmployeeNode; level?: number }) {
  const hasChildren = node.children.length > 0;

  return (
    <div className="relative">
      <Link href={`/people/${node.id}`}>
        <Card className="hover:shadow-md transition-shadow mb-4 max-w-sm">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{node.name}</h3>
                <p className="text-sm text-muted-foreground">{node.jobTitle || "No title"}</p>
                <p className="text-xs text-muted-foreground mt-1">{node.email}</p>
              </div>
              {hasChildren && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {node.children.length}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>

      {hasChildren && (
        <div className="ml-8 border-l-2 border-gray-200 pl-4">
          {node.children.map((child) => (
            <OrgNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default async function OrgChartPage() {
  const roots = await buildOrgTree();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Organization Chart</h1>
        <p className="text-muted-foreground">Company reporting structure</p>
      </div>

      <div className="space-y-4">
        {roots.map((root) => (
          <OrgNode key={root.id} node={root} />
        ))}
      </div>
    </div>
  );
}
