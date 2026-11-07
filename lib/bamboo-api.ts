export function validateApiKey(apiKey: string | null | undefined): boolean {
  if (!apiKey) return false;

  const validKeys = (process.env.BAMBOO_API_KEYS || "").split(",").filter(Boolean);
  return validKeys.includes(apiKey);
}

export function formatBambooEmployee(employee: any, fields?: string): any {
  const allFields = {
    id: employee.id.toString(),
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    preferredName: employee.preferredName,
    displayName: employee.preferredName
      ? `${employee.preferredName} ${employee.lastName}`
      : `${employee.firstName} ${employee.lastName}`,
    email: employee.email,
    workPhone: employee.workPhone,
    workPhoneExtension: employee.extension,
    mobilePhone: employee.mobilePhone,
    jobTitle: employee.jobTitle,
    department: employee.departmentName,
    division: employee.divisionName,
    location: employee.locationName,
    hireDate: employee.hireDate,
    employmentStatus: employee.employmentStatus,
    photoUrl: employee.photoUrl,
  };

  if (!fields) {
    return allFields;
  }

  const requestedFields = fields.split(",").map((f) => f.trim());
  const result: any = {};

  for (const field of requestedFields) {
    if (field in allFields) {
      result[field] = (allFields as any)[field];
    }
  }

  return result;
}
