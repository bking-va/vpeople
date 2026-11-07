import { validateApiKey, formatBambooEmployee } from "@/lib/bamboo-api";

describe("Bamboo API", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("validateApiKey", () => {
    it("should return false for null key", () => {
      process.env.BAMBOO_API_KEYS = "test-key-1,test-key-2";
      expect(validateApiKey(null)).toBe(false);
    });

    it("should return false for invalid key", () => {
      process.env.BAMBOO_API_KEYS = "test-key-1,test-key-2";
      expect(validateApiKey("invalid-key")).toBe(false);
    });

    it("should return true for valid key", () => {
      process.env.BAMBOO_API_KEYS = "test-key-1,test-key-2";
      expect(validateApiKey("test-key-1")).toBe(true);
      expect(validateApiKey("test-key-2")).toBe(true);
    });

    it("should handle empty BAMBOO_API_KEYS env var", () => {
      process.env.BAMBOO_API_KEYS = "";
      expect(validateApiKey("any-key")).toBe(false);
    });
  });

  describe("formatBambooEmployee", () => {
    const mockEmployee = {
      id: 1,
      employeeNumber: "E001",
      firstName: "John",
      lastName: "Doe",
      preferredName: null,
      email: "john.doe@vendasta.com",
      workPhone: "+1-306-555-0100",
      extension: "101",
      mobilePhone: null,
      jobTitle: "Senior Developer",
      departmentName: "Technology",
      divisionName: "R&D",
      locationName: "Saskatoon HQ",
      hireDate: "2020-01-15",
      employmentStatus: "full_time",
      photoUrl: null,
    };

    it("should return all fields when no fields parameter is provided", () => {
      const result = formatBambooEmployee(mockEmployee);
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("employeeNumber");
      expect(result).toHaveProperty("firstName");
      expect(result).toHaveProperty("lastName");
      expect(result).toHaveProperty("email");
      expect(result.displayName).toBe("John Doe");
    });

    it("should return only requested fields", () => {
      const result = formatBambooEmployee(mockEmployee, "id,firstName,email");
      expect(Object.keys(result)).toEqual(["id", "firstName", "email"]);
      expect(result.id).toBe("1");
      expect(result.firstName).toBe("John");
      expect(result.email).toBe("john.doe@vendasta.com");
    });

    it("should use preferredName in displayName if available", () => {
      const empWithPreferred = { ...mockEmployee, preferredName: "Johnny" };
      const result = formatBambooEmployee(empWithPreferred);
      expect(result.displayName).toBe("Johnny Doe");
    });

    it("should handle missing optional fields", () => {
      const result = formatBambooEmployee(mockEmployee, "mobilePhone,photoUrl");
      expect(result.mobilePhone).toBeNull();
      expect(result.photoUrl).toBeNull();
    });
  });
});
