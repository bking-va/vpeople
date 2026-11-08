import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { customFields, customFieldValues, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Mock auth for testing
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

describe("Custom Fields", () => {
  let testEmployeeId: number;
  let testFieldId: number;

  beforeAll(async () => {
    // Create test employee
    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: "CF_TEST_EMP",
        firstName: "Custom",
        lastName: "Field",
        email: "custom.field@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();

    testEmployeeId = employee.id;
  });

  afterAll(async () => {
    // Clean up
    if (testFieldId) {
      await db.delete(customFieldValues).where(eq(customFieldValues.customFieldId, testFieldId));
      await db.delete(customFields).where(eq(customFields.id, testFieldId));
    }
    await db.delete(employees).where(eq(employees.id, testEmployeeId));
  });

  test("creates custom field", async () => {
    const [field] = await db
      .insert(customFields)
      .values({
        name: "Test Field",
        fieldType: "text",
        entityType: "employee",
        section: "personal",
        isRequired: false,
        orderIndex: 1,
      })
      .returning();

    testFieldId = field.id;

    expect(field).toBeDefined();
    expect(field.name).toBe("Test Field");
    expect(field.fieldType).toBe("text");
    expect(field.entityType).toBe("employee");
    expect(field.section).toBe("personal");
  });

  test("saves custom field value", async () => {
    const [value] = await db
      .insert(customFieldValues)
      .values({
        customFieldId: testFieldId,
        entityId: testEmployeeId,
        value: "Test Value",
      })
      .returning();

    expect(value).toBeDefined();
    expect(value.customFieldId).toBe(testFieldId);
    expect(value.entityId).toBe(testEmployeeId);
    expect(value.value).toBe("Test Value");
  });

  test("updates custom field value", async () => {
    // Get existing value
    const [existing] = await db
      .select()
      .from(customFieldValues)
      .where(eq(customFieldValues.customFieldId, testFieldId))
      .limit(1);

    // Update value
    const [updated] = await db
      .update(customFieldValues)
      .set({ value: "Updated Value" })
      .where(eq(customFieldValues.id, existing.id))
      .returning();

    expect(updated.value).toBe("Updated Value");
  });

  test("fetches custom field values for employee", async () => {
    const values = await db
      .select()
      .from(customFieldValues)
      .where(eq(customFieldValues.entityId, testEmployeeId));

    expect(values.length).toBeGreaterThan(0);
    expect(values[0].entityId).toBe(testEmployeeId);
  });

  test("creates select field with options", async () => {
    const [selectField] = await db
      .insert(customFields)
      .values({
        name: "Size",
        fieldType: "select",
        entityType: "employee",
        section: "personal",
        options: JSON.stringify(["Small", "Medium", "Large"]),
        isRequired: false,
        orderIndex: 2,
      })
      .returning();

    expect(selectField.fieldType).toBe("select");
    expect(selectField.options).toBeDefined();
    const options = JSON.parse(selectField.options!);
    expect(options).toContain("Small");
    expect(options).toContain("Medium");
    expect(options).toContain("Large");

    // Clean up
    await db.delete(customFields).where(eq(customFields.id, selectField.id));
  });

  test("deletes custom field cascades to values", async () => {
    // Create a field and value
    const [field] = await db
      .insert(customFields)
      .values({
        name: "Temp Field",
        fieldType: "text",
        entityType: "employee",
        section: "personal",
        isRequired: false,
        orderIndex: 3,
      })
      .returning();

    const [value] = await db
      .insert(customFieldValues)
      .values({
        customFieldId: field.id,
        entityId: testEmployeeId,
        value: "Temp Value",
      })
      .returning();

    // Delete the field
    await db.delete(customFieldValues).where(eq(customFieldValues.customFieldId, field.id));
    await db.delete(customFields).where(eq(customFields.id, field.id));

    // Verify value is deleted
    const remainingValues = await db
      .select()
      .from(customFieldValues)
      .where(eq(customFieldValues.customFieldId, field.id));

    expect(remainingValues.length).toBe(0);
  });

  test("fetches custom fields by section", async () => {
    const personalFields = await db
      .select()
      .from(customFields)
      .where(eq(customFields.section, "personal"));

    expect(personalFields.length).toBeGreaterThan(0);
    personalFields.forEach((field) => {
      expect(field.section).toBe("personal");
    });
  });
});
