"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, Users } from "lucide-react";

export default function TrainingAssignPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [assignmentType, setAssignmentType] = useState<"individual" | "department">("individual");
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Fetch courses
    fetch("/api/training/courses")
      .then((res) => res.json())
      .then((data) => setCourses(data.courses || []));

    // Fetch departments
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => setDepartments(data.departments || []));

    // Fetch employees
    fetch("/api/employees")
      .then((res) => res.json())
      .then((data) => setEmployees(data.employees || []));
  }, []);

  const toggleEmployee = (empId: number) => {
    setSelectedEmployees((prev) =>
      prev.includes(empId)
        ? prev.filter((id) => id !== empId)
        : [...prev, empId]
    );
  };

  const handleAssign = async () => {
    if (!selectedCourse || !dueDate) {
      alert("Please select a course and due date");
      return;
    }

    if (assignmentType === "individual" && selectedEmployees.length === 0) {
      alert("Please select at least one employee");
      return;
    }

    if (assignmentType === "department" && !selectedDepartment) {
      alert("Please select a department");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/training/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: parseInt(selectedCourse),
          type: assignmentType,
          employeeIds: assignmentType === "individual" ? selectedEmployees : undefined,
          departmentId: assignmentType === "department" ? parseInt(selectedDepartment) : undefined,
          dueDate,
        }),
      });

      if (response.ok) {
        alert("Training assigned successfully!");
        setSelectedCourse("");
        setSelectedEmployees([]);
        setSelectedDepartment("");
        setDueDate("");
      } else {
        alert("Failed to assign training");
      }
    } catch (error) {
      console.error("Assignment failed:", error);
      alert("Assignment failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assign Training</h1>
        <p className="text-muted-foreground">
          Assign courses to employees or departments
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Training Assignment</CardTitle>
          <CardDescription>
            Select a course, choose recipients, and set a due date
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Training Course</Label>
            <Select value={selectedCourse} onValueChange={setSelectedCourse}>
              <SelectTrigger>
                <SelectValue placeholder="Select a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id.toString()}>
                    {course.name} ({course.duration} min)
                    {course.isRequired && " - Required"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Assignment Type</Label>
            <div className="flex gap-4">
              <Button
                type="button"
                variant={assignmentType === "individual" ? "default" : "outline"}
                onClick={() => setAssignmentType("individual")}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Individual
              </Button>
              <Button
                type="button"
                variant={assignmentType === "department" ? "default" : "outline"}
                onClick={() => setAssignmentType("department")}
              >
                <Users className="mr-2 h-4 w-4" />
                Department
              </Button>
            </div>
          </div>

          {assignmentType === "individual" && (
            <div className="space-y-2">
              <Label>Select Employees</Label>
              <div className="border rounded-md p-4 max-h-64 overflow-y-auto space-y-2">
                {employees.map((emp) => (
                  <div key={emp.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`emp-${emp.id}`}
                      checked={selectedEmployees.includes(emp.id)}
                      onCheckedChange={() => toggleEmployee(emp.id)}
                    />
                    <Label
                      htmlFor={`emp-${emp.id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {emp.firstName} {emp.lastName} - {emp.jobTitle}
                    </Label>
                  </div>
                ))}
              </div>
              {selectedEmployees.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {selectedEmployees.length} employee(s) selected
                </p>
              )}
            </div>
          )}

          {assignmentType === "department" && (
            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={selectedDepartment}
                onValueChange={setSelectedDepartment}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id.toString()}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>

          <Button onClick={handleAssign} disabled={isSubmitting}>
            {isSubmitting ? "Assigning..." : "Assign Training"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
