import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { departments, divisions, teams, locations } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminPage() {
  const session = await auth();

  if (session?.user?.role !== "admin") {
    redirect("/people");
  }

  const [depts, divs, allTeams, locs] = await Promise.all([
    db.select().from(departments),
    db.select().from(divisions),
    db.select().from(teams),
    db.select().from(locations),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Administration</h1>
        <p className="text-muted-foreground">
          Manage organizational structure and settings
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Departments ({depts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {depts.map((dept) => (
                <div key={dept.id} className="border-b pb-2">
                  <p className="font-medium">{dept.name}</p>
                  {dept.description && (
                    <p className="text-sm text-muted-foreground">{dept.description}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Divisions ({divs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {divs.map((div) => (
                <div key={div.id} className="border-b pb-2">
                  <p className="font-medium">{div.name}</p>
                  {div.description && (
                    <p className="text-sm text-muted-foreground">{div.description}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Teams ({allTeams.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allTeams.map((team) => (
                <div key={team.id} className="border-b pb-2">
                  <p className="font-medium">{team.name}</p>
                  {team.description && (
                    <p className="text-sm text-muted-foreground">{team.description}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Locations ({locs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {locs.map((loc) => (
                <div key={loc.id} className="border-b pb-2">
                  <p className="font-medium">{loc.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {loc.city ? `${loc.city}, ` : ""}
                    {loc.country}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
