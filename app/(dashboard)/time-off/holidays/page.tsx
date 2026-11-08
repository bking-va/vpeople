import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { holidays } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function HolidaysPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const allHolidays = await db
    .select()
    .from(holidays)
    .orderBy(holidays.date);

  const byCountry = allHolidays.reduce((acc, holiday) => {
    if (!acc[holiday.country]) {
      acc[holiday.country] = [];
    }
    acc[holiday.country].push(holiday);
    return acc;
  }, {} as Record<string, typeof allHolidays>);

  const countryNames: Record<string, string> = {
    CA: "Canada",
    US: "United States",
    IN: "India",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Company Holidays</h1>
        <p className="text-muted-foreground">
          Official holidays by country
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {Object.entries(byCountry).map(([countryCode, holidays]) => (
          <Card key={countryCode}>
            <CardHeader>
              <CardTitle>{countryNames[countryCode] || countryCode}</CardTitle>
              <CardDescription>
                {holidays.length} holidays in 2027
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {holidays.map((holiday) => (
                  <div key={holiday.id} className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{holiday.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(holiday.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                    {holiday.isRecurring && (
                      <Badge variant="secondary" className="text-xs">
                        Recurring
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
