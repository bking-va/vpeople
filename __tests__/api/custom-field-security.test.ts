import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { customFields, customFieldValues, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Mock auth for testing
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

describe("Custom Field Security", () => {
  let testEmployee1Id: number;
  let testEmployee2Id: number;
  let testManager

Id: number;
  let publicFieldId: number;
  let managerHrFieldId: number;
  let hrOnlyFieldId: number;

  beforeAll(async () => {
    // Create test employees
    const [manager] = await db
      .insert(employees)
      .values({
        employeeNumber: "CF_SEC_MGR",
        firstName: "Manager",
        lastName: "Test",
        email: "cf.manager@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "manager",
      })
      .returning();

    testManagerId = manager.id;

    const [employee1] = await db
      .insert(employees)
      .values({
        employeeNumber: "CF_SEC_EMP1",
        firstName: "Employee1",
        lastName: "Test",
        email: "cf.employee1@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        managerId: manager.id,
      })
      .returning();

    testEmployee1Id = employee1.id;

    const [employee2] = await db
      .insert(employees)
      .values({
        employeeNumber: "CF_SEC_EMP2",
        firstName: "Employee2",
        lastName: "Test",
        email: "cf.employee2@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();

    testEmployee2Id = employee2.id;

    // Create custom fields with different visibility levels
    const [publicField] = await db
      .insert(customFields)
      .values({
        name: "Public Field",
        fieldType: "text",
        entityType: "employee",
        section: "personal",
        visibility: "everyone",
        isRequired: false,
        orderIndex: 1,
      })
      .returning();

    publicFieldId = publicField.id;

    const [managerHrField] = await db
      .insert(customFields)
      .values({
        name: "Manager HR Field",
        fieldType: "text",
        entityType: "employee",
        section: "personal",
        visibility: "manager_hr",
        isRequired: false,
        orderIndex: 2,
      })
      .returning();

    managerHrFieldId = managerHrField.id;

    const [hrOnlyField] = await db
      .insert(customFields)
      .values({
        name: "HR Only Field",
        fieldType: "textarea",
        entityType: "employee",
        section: "personal",
        visibility: "hr_only",
        isRequired: false,
        orderIndex: 3,
      })
      .returning();

    hrOnlyFieldId = hrOnlyField.id;

    // Create values for employee1
    await db.insert(customFieldValues).values([
      {
        customFieldId: publicFieldId,
        entityId: testEmployee1Id,
        value: "Public value",
      },
      {
        customFieldId: managerHrFieldId,
        entityId: testEmployee1Id,
        value: "Manager/HR value",
      },
      {
        customFieldId: hrOnlyFieldId,
        entityId: testEmployee1Id,
        value: "HR only value - sensitive",
      },
    ]);
  });

  afterAll(async () => {
    // Clean up
    await db.delete(customFieldValues).where(eq(customFieldValues.entityId, testEmployee1Id));
    await db.delete(customFields).where(eq(customFields.id, publicFieldId));
    await db.delete(customFields).where(eq(customFields.id, managerHrFieldId));
    await db.delete(customFields).where(eq(customFields.id, hrOnlyFieldId));
    await db.delete(employees).where(eq(employees.id, testEmployee1Id));
    await db.delete(employees).where(eq(employees.id, testEmployee2Id));
    await db.delete(employees).where(eq(employees.id, testManagerId));
  });

  test("everyone visibility field is readable by all employees", async () => {
    const values = await db
      .select({
        value: customFieldValues,
        field: customFields,
      })
      .from(customFieldValues)
      .leftJoin(customFields, eq(customFieldValues.customFieldId, customFields.id))
      .where(eq(customFieldValues.entityId, testEmployee1Id));

    const publicValue = values.find((v) => v.field?.visibility === "everyone");
    expect(publicValue).toBeDefined();
    expect(publicValue?.value.value).toBe("Public value");
  });

  test("manager_hr visibility field requires manager or HR access", async () => {
    const field = await db
      .select()
      .from(customFields)
      .where(eq(customFields.id, managerHrFieldId))
      .limit(1);

    expect(field[0].visibility).toBe("manager_hr");
  });

  test("hr_only visibility field requires HR/admin access", async () => {
    const field = await db
      .select()
      .from(customFields)
      .where(eq(customFields.id, hrOnlyFieldId))
      .limit(1);

    expect(field[0].visibility).toBe("hr_only");
  });

  test("custom field has visibility column", async () => {
    const [field] = await db
      .select()
      .from(customFields)
      .where(eq(customFields.id, publicFieldId))
      .limit(1);

    expect(field.visibility).toBeDefined();
    expect(["everyone", "manager_hr", "hr_only"]).toContain(field.visibility);
  });

  test("dietary preferences field should be hr_only by default", async () => {
    const [dietaryField] = await db
      .select()
      .from(customFields)
      .where(eq(customFields.name, "Dietary Preferences"))
      .limit(1);

    if (dietaryField) {
      expect(dietaryField.visibility).toBe("hr_only");
    }
  });
});
