import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { trainingCourses, trainingCompletions, employees } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Award, Clock } from "lucide-react";

export default async function TrainingPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  const [employee] = await db.query.employees.findMany({
    where: (employees, { eq }) => eq(employees.email, session.user.email),
    limit: 1,
  });

  if (!employee) {
    redirect("/auth/signin");
  }

  const allCourses = await db.select().from(trainingCourses);

  const myCompletions = await db
    .select({
      completion: trainingCompletions,
      course: trainingCourses,
    })
    .from(trainingCompletions)
    .leftJoin(trainingCourses, eq(trainingCompletions.courseId, trainingCourses.id))
    .where(eq(trainingCompletions.employeeId, employee.id));

  const completedCourseIds = new Set(myCompletions.map((c) => c.completion.courseId));
  const assignedCourses = allCourses.filter((c) => !completedCourseIds.has(c.id));

  const totalHours = myCompletions.reduce((sum, c) => {
    return sum + parseFloat(c.course?.durationHours || "0");
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Training & Development</h1>
          <p className="text-muted-foreground">Track employee training and certifications</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Available Courses</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignedCourses.length}</div>
            <p className="text-xs text-muted-foreground">To complete</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myCompletions.length}</div>
            <p className="text-xs text-muted-foreground">Courses completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Training Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">Total hours</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available Courses</CardTitle>
          <CardDescription>
            Training courses available to you
          </CardDescription>
        </CardHeader>
        <CardContent>
          {assignedCourses.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                No courses available
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignedCourses.map((course) => (
                <div
                  key={course.id}
                  className="p-4 border rounded-lg hover:bg-accent"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{course.name}</div>
                      {course.description && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {course.description}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {course.category && (
                          <Badge variant="outline">{course.category}</Badge>
                        )}
                        {course.durationHours && (
                          <span className="text-sm text-muted-foreground">
                            {course.durationHours} hours
                          </span>
                        )}
                      </div>
                    </div>
                    {course.isRequired && (
                      <Badge variant="default">Required</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Completions</CardTitle>
          <CardDescription>
            Courses you have completed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {myCompletions.length === 0 ? (
            <div className="text-center py-8">
              <Award className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No completions yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myCompletions.map((item) => (
                <div
                  key={item.completion.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-medium">{item.course?.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.completion.completedAt && (
                        <>Completed {new Date(item.completion.completedAt).toLocaleDateString()}</>
                      )}
                      {item.completion.expiresAt && (
                        <> • Expires {new Date(item.completion.expiresAt).toLocaleDateString()}</>
                      )}
                    </div>
                  </div>
                  <Badge variant="default">Complete</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
