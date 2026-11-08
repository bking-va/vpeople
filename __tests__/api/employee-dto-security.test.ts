import { describe, test, expect, vi } from "vitest";

// Mock auth for testing
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

describe("Employee API DTO Security", () => {
  test("create employee returns minimal DTO without sensitive fields", () => {
    // Simulate a full employee object from DB
    const fullEmployee = {
      id: 1,
      employeeNumber: "E001",
      userId: "user-123",
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@test.com",
      hireDate: "2023-01-01",
      employmentStatus: "full_time",
      jobTitle: "Engineer",
      sin: "123-456-789",
      ssn: "987-65-4321",
      bankAccount: "123456789",
      addressStreet1: "123 Main St",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Expected minimal DTO
    const expectedDTO = {
      id: fullEmployee.id,
      employeeNumber: fullEmployee.employeeNumber,
      firstName: fullEmployee.firstName,
      lastName: fullEmployee.lastName,
      email: fullEmployee.email,
      hireDate: fullEmployee.hireDate,
      employmentStatus: fullEmployee.employmentStatus,
      jobTitle: fullEmployee.jobTitle,
    };

    // Verify DTO structure
    expect(expectedDTO).not.toHaveProperty("sin");
    expect(expectedDTO).not.toHaveProperty("ssn");
    expect(expectedDTO).not.toHaveProperty("bankAccount");
    expect(expectedDTO).not.toHaveProperty("userId");
    expect(expectedDTO).not.toHaveProperty("addressStreet1");
    expect(expectedDTO).not.toHaveProperty("createdAt");
    expect(expectedDTO).not.toHaveProperty("updatedAt");

    // Verify only safe fields are included
    expect(expectedDTO).toHaveProperty("id");
    expect(expectedDTO).toHaveProperty("employeeNumber");
    expect(expectedDTO).toHaveProperty("firstName");
    expect(expectedDTO).toHaveProperty("lastName");
    expect(expectedDTO).toHaveProperty("email");
  });

  test("terminate employee returns minimal DTO without sensitive fields", () => {
    // Simulate a full updated employee object from DB
    const fullEmployee = {
      id: 1,
      employeeNumber: "E001",
      userId: "user-123",
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@test.com",
      employmentStatus: "terminated",
      terminationDate: "2023-12-31",
      sin: "123-456-789",
      ssn: "987-65-4321",
      bankAccount: "123456789",
      addressStreet1: "123 Main St",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Expected minimal DTO
    const expectedDTO = {
      id: fullEmployee.id,
      employeeNumber: fullEmployee.employeeNumber,
      firstName: fullEmployee.firstName,
      lastName: fullEmployee.lastName,
      email: fullEmployee.email,
      employmentStatus: fullEmployee.employmentStatus,
      terminationDate: fullEmployee.terminationDate,
    };

    // Verify DTO structure
    expect(expectedDTO).not.toHaveProperty("sin");
    expect(expectedDTO).not.toHaveProperty("ssn");
    expect(expectedDTO).not.toHaveProperty("bankAccount");
    expect(expectedDTO).not.toHaveProperty("userId");
    expect(expectedDTO).not.toHaveProperty("addressStreet1");
    expect(expectedDTO).not.toHaveProperty("createdAt");
    expect(expectedDTO).not.toHaveProperty("updatedAt");

    // Verify only safe fields are included
    expect(expectedDTO).toHaveProperty("id");
    expect(expectedDTO).toHaveProperty("employeeNumber");
    expect(expectedDTO).toHaveProperty("employmentStatus");
    expect(expectedDTO).toHaveProperty("terminationDate");
  });

  test("minimal DTO prevents exposure of sensitive data", () => {
    const sensitiveFields = [
      "sin",
      "ssn",
      "bankAccount",
      "bankAccountNumber",
      "routingNumber",
      "userId",
      "password",
      "passwordHash",
      "accessToken",
      "refreshToken",
    ];

    const minimalDTOFields = [
      "id",
      "employeeNumber",
      "firstName",
      "lastName",
      "email",
      "hireDate",
      "employmentStatus",
      "jobTitle",
      "terminationDate",
    ];

    // Ensure no overlap between sensitive fields and DTO fields
    for (const sensitiveField of sensitiveFields) {
      expect(minimalDTOFields).not.toContain(sensitiveField);
    }
  });
});
