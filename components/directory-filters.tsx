"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Phone, MapPin, Users, Search, Download } from "lucide-react";

interface Employee {
  id: number;
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string;
  workPhone: string | null;
  extension: string | null;
  jobTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  locationId: number | null;
  locationName: string | null;
  reportCount: number;
}

interface DirectoryFiltersProps {
  employees: Employee[];
  departments: Array<{ id: number; name: string }>;
  locations: Array<{ id: number; name: string }>;
}

export function DirectoryFilters({ employees, departments, locations }: DirectoryFiltersProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [selectedLoc, setSelectedLoc] = useState<string>("all");

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      !searchTerm ||
      emp.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.jobTitle &&
        emp.jobTitle.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesDept =
      selectedDept === "all" ||
      emp.departmentId?.toString() === selectedDept;

    const matchesLoc =
      selectedLoc === "all" ||
      emp.locationId?.toString() === selectedLoc;

    return matchesSearch && matchesDept && matchesLoc;
  });

  const handleExport = () => {
    const csv = [
      ["Name", "Email", "Job Title", "Department", "Location", "Phone"].join(","),
      ...filteredEmployees.map((emp) => [
        `"${emp.preferredName || emp.firstName} ${emp.lastName}"`,
        emp.email,
        emp.jobTitle || "",
        emp.departmentName || "",
        emp.locationName || "",
        emp.workPhone || "",
      ].join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employees-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">People Directory</h1>
          <p className="text-muted-foreground">
            {filteredEmployees.length} of {employees.length} employees
          </p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={selectedDept} onValueChange={setSelectedDept}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id.toString()}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedLoc} onValueChange={setSelectedLoc}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="All Locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id.toString()}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredEmployees.map((employee) => {
          const displayName = employee.preferredName
            ? `${employee.preferredName} ${employee.lastName}`
            : `${employee.firstName} ${employee.lastName}`;

          return (
            <Link key={employee.id} href={`/people/${employee.id}`}>
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{displayName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {employee.jobTitle || "No title"}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {employee.employeeNumber}
                      </Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      {employee.departmentName && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>{employee.departmentName}</span>
                        </div>
                      )}
                      {employee.locationName && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <span>{employee.locationName}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        <span className="truncate">{employee.email}</span>
                      </div>
                      {employee.workPhone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          <span>
                            {employee.workPhone}
                            {employee.extension ? ` x${employee.extension}` : ""}
                          </span>
                        </div>
                      )}
                    </div>

                    {employee.reportCount > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          {employee.reportCount} direct report{employee.reportCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
