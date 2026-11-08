import { db } from "@/lib/db";
import { seats, employees } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

interface SeatNode {
  id: number;
  title: string;
  accountabilities: string[];
  isOpen: boolean;
  assignedEmployee: {
    id: number;
    name: string;
    email: string;
  } | null;
  children: SeatNode[];
}

async function buildSeatTree(): Promise<SeatNode[]> {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const allSeats = await db
    .select({
      seat: seats,
      employee: employees,
    })
    .from(seats)
    .leftJoin(employees, eq(seats.assignedEmployeeId, employees.id));

  const seatMap = new Map<number, SeatNode>();
  const roots: SeatNode[] = [];

  for (const item of allSeats) {
    const { seat, employee } = item;
    const accountabilities = (seat.accountabilities as string[]) || [];

    seatMap.set(seat.id, {
      id: seat.id,
      title: seat.title,
      accountabilities,
      isOpen: seat.isOpen || false,
      assignedEmployee: employee
        ? {
            id: employee.id,
            name: employee.preferredName
              ? `${employee.preferredName} ${employee.lastName}`
              : `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
          }
        : null,
      children: [],
    });
  }

  for (const item of allSeats) {
    const seat = item.seat;
    const node = seatMap.get(seat.id)!;

    if (seat.parentSeatId === null) {
      roots.push(node);
    } else {
      const parent = seatMap.get(seat.parentSeatId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  return roots;
}

function SeatNode({ node, level = 0 }: { node: SeatNode; level?: number }) {
  const hasChildren = node.children.length > 0;

  return (
    <div className="relative">
      <Card className="mb-4 max-w-2xl">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">{node.title}</CardTitle>
              {node.isOpen && (
                <Badge variant="secondary" className="mt-2">
                  Open Position
                </Badge>
              )}
            </div>
            {!node.isOpen && node.assignedEmployee && (
              <Link
                href={`/people/${node.assignedEmployee.id}`}
                className="text-sm text-primary hover:underline"
              >
                {node.assignedEmployee.name}
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {node.accountabilities.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Accountabilities:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                {node.accountabilities.map((accountability, idx) => (
                  <li key={idx}>{accountability}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {hasChildren && (
        <div className="ml-8 border-l-2 border-gray-200 pl-4">
          {node.children.map((child) => (
            <SeatNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default async function SeatsPage() {
  const roots = await buildSeatTree();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Seats (Accountability Chart)</h1>
        <p className="text-muted-foreground">
          VOS-style accountability chart showing organizational roles and responsibilities
        </p>
      </div>

      <div className="space-y-4">
        {roots.map((root) => (
          <SeatNode key={root.id} node={root} />
        ))}
      </div>
    </div>
  );
}
