import { db } from "./db";
import * as schema from "./db/schema";
import { sql, eq, inArray } from "drizzle-orm";

const VENDASTA_DOMAIN = "vendasta.com";

export async function runSeed(options: { reset?: boolean } = {}) {
  const { reset = false } = options;

  console.log("🌱 Seeding database...");

  if (reset) {
    console.log("⚠️  Resetting database (--reset flag detected)...");

    await db.execute(sql`TRUNCATE TABLE audit_logs CASCADE`);
    await db.execute(sql`TRUNCATE TABLE employee_tasks CASCADE`);
    await db.execute(sql`TRUNCATE TABLE task_templates CASCADE`);
    await db.execute(sql`TRUNCATE TABLE employee_notes CASCADE`);
    await db.execute(sql`TRUNCATE TABLE emergency_contacts CASCADE`);
    await db.execute(sql`TRUNCATE TABLE time_off_requests CASCADE`);
    await db.execute(sql`TRUNCATE TABLE time_off_balances CASCADE`);
    await db.execute(sql`TRUNCATE TABLE time_off_policies CASCADE`);
    await db.execute(sql`TRUNCATE TABLE equity_grants CASCADE`);
    await db.execute(sql`TRUNCATE TABLE bonus_details CASCADE`);
    await db.execute(sql`TRUNCATE TABLE compensation_history CASCADE`);
    await db.execute(sql`TRUNCATE TABLE job_history CASCADE`);
    await db.execute(sql`TRUNCATE TABLE employee_teams CASCADE`);
    await db.execute(sql`TRUNCATE TABLE employees CASCADE`);
    await db.execute(sql`TRUNCATE TABLE seats CASCADE`);
    await db.execute(sql`TRUNCATE TABLE teams CASCADE`);
    await db.execute(sql`TRUNCATE TABLE job_levels CASCADE`);
    await db.execute(sql`TRUNCATE TABLE job_families CASCADE`);
    await db.execute(sql`TRUNCATE TABLE divisions CASCADE`);
    await db.execute(sql`TRUNCATE TABLE departments CASCADE`);
    await db.execute(sql`TRUNCATE TABLE locations CASCADE`);

    console.log("✅ Database reset complete");
  }

  console.log("Creating locations...");

  const locationValues = [
    {
      name: "Saskatoon HQ",
      address: "200 - 333 3rd Avenue North",
      city: "Saskatoon",
      province: "Saskatchewan",
      country: "Canada",
      postalCode: "S7K 2M2",
      timezone: "America/Regina",
      isHeadquarters: true,
    },
    {
      name: "Chennai HQ",
      address: "DLF IT Park, Block 3",
      city: "Chennai",
      province: "Tamil Nadu",
      country: "India",
      postalCode: "600089",
      timezone: "Asia/Kolkata",
      isHeadquarters: true,
    },
    {
      name: "Boca Raton",
      address: "2255 Glades Road, Suite 324A",
      city: "Boca Raton",
      province: "Florida",
      country: "United States",
      postalCode: "33431",
      timezone: "America/New_York",
      isHeadquarters: false,
    },
    {
      name: "Toronto",
      address: "120 Adelaide St W",
      city: "Toronto",
      province: "Ontario",
      country: "Canada",
      postalCode: "M5H 1T1",
      timezone: "America/Toronto",
      isHeadquarters: false,
    },
    {
      name: "Remote",
      address: null,
      city: null,
      province: null,
      country: "Various",
      postalCode: null,
      timezone: "America/Regina",
      isHeadquarters: false,
    },
  ];

  await db.insert(schema.locations).values(locationValues).onConflictDoNothing();

  const locationNames = locationValues.map((l) => l.name);
  const allLocations = await db
    .select()
    .from(schema.locations)
    .where(inArray(schema.locations.name, locationNames));

  const saskatoon = allLocations.find((l) => l.name === "Saskatoon HQ")!;
  const chennai = allLocations.find((l) => l.name === "Chennai HQ")!;
  const bocaRaton = allLocations.find((l) => l.name === "Boca Raton")!;
  const toronto = allLocations.find((l) => l.name === "Toronto")!;
  const remote = allLocations.find((l) => l.name === "Remote")!;

  console.log("Creating departments...");

  const departmentValues = [
    {
      name: "Technology",
      description: "Engineering and technical operations",
    },
    {
      name: "Vendasta Services",
      description: "Customer success and support",
    },
    { name: "Sales", description: "Sales and business development" },
    { name: "Marketing", description: "Marketing and brand" },
    { name: "Finance & Admin", description: "Finance and administration" },
    {
      name: "People Operations",
      description: "HR and people management",
    },
    { name: "Product", description: "Product management and design" },
  ];

  await db
    .insert(schema.departments)
    .values(departmentValues)
    .onConflictDoNothing();

  const departmentNames = departmentValues.map((d) => d.name);
  const allDepartments = await db
    .select()
    .from(schema.departments)
    .where(inArray(schema.departments.name, departmentNames));

  const tech = allDepartments.find((d) => d.name === "Technology")!;
  const services = allDepartments.find((d) => d.name === "Vendasta Services")!;
  const sales = allDepartments.find((d) => d.name === "Sales")!;
  const marketing = allDepartments.find((d) => d.name === "Marketing")!;
  const financeAdmin = allDepartments.find(
    (d) => d.name === "Finance & Admin"
  )!;
  const peopleOps = allDepartments.find(
    (d) => d.name === "People Operations"
  )!;
  const product = allDepartments.find((d) => d.name === "Product")!;

  console.log("Creating divisions...");

  const divisionValues = [
    { name: "R&D", description: "Research and Development" },
    { name: "Support", description: "Customer Support" },
    {
      name: "Channel Sales",
      description: "Partner and channel sales",
    },
    {
      name: "Corporate Marketing",
      description: "Corporate marketing and communications",
    },
    { name: "Finance", description: "Finance and accounting" },
  ];

  await db
    .insert(schema.divisions)
    .values(divisionValues)
    .onConflictDoNothing();

  const divisionNames = divisionValues.map((d) => d.name);
  const allDivisions = await db
    .select()
    .from(schema.divisions)
    .where(inArray(schema.divisions.name, divisionNames));

  const rdDiv = allDivisions.find((d) => d.name === "R&D")!;
  const supportDiv = allDivisions.find((d) => d.name === "Support")!;
  const channelSalesDiv = allDivisions.find((d) => d.name === "Channel Sales")!;
  const corpMarketingDiv = allDivisions.find(
    (d) => d.name === "Corporate Marketing"
  )!;
  const financeDiv = allDivisions.find((d) => d.name === "Finance")!;

  console.log("Creating teams...");

  const teamValues = [
    { name: "Phoenix", description: "Core platform team" },
    { name: "Website & SEO Managed Services", description: "SEO services" },
    { name: "Support - Tier 1", description: "Front-line support" },
    { name: "SRE", description: "Site Reliability Engineering" },
  ];

  await db.insert(schema.teams).values(teamValues).onConflictDoNothing();

  const teamNames = teamValues.map((t) => t.name);
  const allTeams = await db
    .select()
    .from(schema.teams)
    .where(inArray(schema.teams.name, teamNames));

  const phoenixTeam = allTeams.find((t) => t.name === "Phoenix")!;
  const seoTeam = allTeams.find(
    (t) => t.name === "Website & SEO Managed Services"
  )!;
  const supportTeam = allTeams.find((t) => t.name === "Support - Tier 1")!;
  const sreTeam = allTeams.find((t) => t.name === "SRE")!;

  console.log("Creating job families...");

  const jobFamilyValues = [
    { name: "Individual Contributor", description: "IC track" },
    { name: "Manager", description: "Management track" },
    { name: "Contractor", description: "Contract positions" },
  ];

  await db
    .insert(schema.jobFamilies)
    .values(jobFamilyValues)
    .onConflictDoNothing();

  const jobFamilyNames = jobFamilyValues.map((f) => f.name);
  const allJobFamilies = await db
    .select()
    .from(schema.jobFamilies)
    .where(inArray(schema.jobFamilies.name, jobFamilyNames));

  const icFamily = allJobFamilies.find(
    (f) => f.name === "Individual Contributor"
  )!;
  const managerFamily = allJobFamilies.find((f) => f.name === "Manager")!;
  const contractorFamily = allJobFamilies.find((f) => f.name === "Contractor")!;

  console.log("Creating job levels...");

  const jobLevelValues = [
    { code: "IC1", name: "IC1", description: "Junior individual contributor" },
    { code: "IC2", name: "IC2", description: "Intermediate IC" },
    { code: "IC3", name: "IC3", description: "Senior IC" },
    { code: "IC4", name: "IC4", description: "Staff IC" },
    { code: "IC5", name: "IC5", description: "Principal IC" },
    { code: "IC6", name: "IC6", description: "Distinguished IC" },
    { code: "M1", name: "M1", description: "Manager" },
    { code: "M2", name: "M2", description: "Senior Manager" },
    { code: "M3", name: "M3", description: "Director" },
    { code: "M4", name: "M4", description: "VP" },
    { code: "M5", name: "M5", description: "SVP" },
    { code: "M6", name: "M6", description: "C-level" },
  ];

  await db
    .insert(schema.jobLevels)
    .values(jobLevelValues)
    .onConflictDoNothing();

  const jobLevelCodes = jobLevelValues.map((l) => l.code);
  const levels = await db
    .select()
    .from(schema.jobLevels)
    .where(inArray(schema.jobLevels.code, jobLevelCodes));

  console.log("Creating CEO...");

  const ceoValue = {
    employeeNumber: "E001",
    firstName: "Brendan",
    lastName: "King",
    email: `brendan.king@${VENDASTA_DOMAIN}`,
    jobTitle: "Chief Executive Officer",
    departmentId: financeAdmin.id,
    locationId: saskatoon.id,
    hireDate: "2008-03-15",
    employmentStatus: "full_time" as const,
    jobFamilyId: managerFamily.id,
    jobLevelId: levels.find((l) => l.code === "M6")!.id,
    accessLevel: "full_admin" as const,
    workPhone: "+1-306-955-5512",
    extension: "101",
  };

  await db.insert(schema.employees).values([ceoValue]).onConflictDoNothing();

  const [ceo] = await db
    .select()
    .from(schema.employees)
    .where(eq(schema.employees.email, `brendan.king@${VENDASTA_DOMAIN}`))
    .limit(1);

  console.log("Creating C-suite and VPs...");

  const executiveValues = [
    {
      employeeNumber: "E002",
      firstName: "Jean",
      lastName: "Parchewsky",
      email: `jean.parchewsky@${VENDASTA_DOMAIN}`,
      jobTitle: "Chief People Officer",
      departmentId: peopleOps.id,
      locationId: saskatoon.id,
      managerId: ceo.id,
      hireDate: "2018-06-12",
      employmentStatus: "full_time" as const,
      jobFamilyId: managerFamily.id,
      jobLevelId: levels.find((l) => l.code === "M6")!.id,
      accessLevel: "full_admin" as const,
      workPhone: "+1-306-955-5513",
      extension: "102",
    },
    {
      employeeNumber: "E003",
      firstName: "David",
      lastName: "Chen",
      email: `david.chen@${VENDASTA_DOMAIN}`,
      jobTitle: "Chief Technology Officer",
      departmentId: tech.id,
      divisionId: rdDiv.id,
      locationId: saskatoon.id,
      managerId: ceo.id,
      hireDate: "2010-09-01",
      employmentStatus: "full_time" as const,
      jobFamilyId: managerFamily.id,
      jobLevelId: levels.find((l) => l.code === "M6")!.id,
      accessLevel: "full_admin" as const,
      workPhone: "+1-306-955-5514",
      extension: "103",
    },
    {
      employeeNumber: "E004",
      firstName: "Sarah",
      lastName: "Martinez",
      email: `sarah.martinez@${VENDASTA_DOMAIN}`,
      jobTitle: "VP of Sales",
      departmentId: sales.id,
      divisionId: channelSalesDiv.id,
      locationId: bocaRaton.id,
      managerId: ceo.id,
      hireDate: "2015-02-20",
      employmentStatus: "full_time" as const,
      jobFamilyId: managerFamily.id,
      jobLevelId: levels.find((l) => l.code === "M4")!.id,
      accessLevel: "regional_view" as const,
      workPhone: "+1-561-555-0100",
      extension: "104",
    },
    {
      employeeNumber: "E005",
      firstName: "Raj",
      lastName: "Patel",
      email: `raj.patel@${VENDASTA_DOMAIN}`,
      jobTitle: "Director of Engineering - India",
      departmentId: tech.id,
      divisionId: rdDiv.id,
      locationId: chennai.id,
      managerId: ceo.id,
      hireDate: "2016-11-05",
      employmentStatus: "full_time" as const,
      jobFamilyId: managerFamily.id,
      jobLevelId: levels.find((l) => l.code === "M3")!.id,
      accessLevel: "regional_view" as const,
      workPhone: "+91-44-555-0100",
      extension: "201",
    },
  ];

  await db
    .insert(schema.employees)
    .values(executiveValues)
    .onConflictDoNothing();

  const executiveEmails = executiveValues.map((e) => e.email);
  const executives = await db
    .select()
    .from(schema.employees)
    .where(inArray(schema.employees.email, executiveEmails));

  const existingEmpCount = await db.$count(schema.employees);
  const shouldSkipEmployees = existingEmpCount > 10;

  if (shouldSkipEmployees) {
    console.log(
      `  ${existingEmpCount} employees already exist, skipping employee creation...`
    );
  }

  console.log("Creating managers and employees...");
  const employeesData = [];
  let empNumber = 6;

  const firstNames = [
    "Emma",
    "Liam",
    "Olivia",
    "Noah",
    "Ava",
    "Ethan",
    "Sophia",
    "Mason",
    "Isabella",
    "William",
    "Mia",
    "James",
    "Charlotte",
    "Benjamin",
    "Amelia",
    "Lucas",
    "Harper",
    "Henry",
    "Evelyn",
    "Alexander",
    "Abigail",
    "Michael",
    "Emily",
    "Daniel",
    "Elizabeth",
    "Matthew",
    "Sofia",
    "Joseph",
    "Avery",
    "Samuel",
    "Ella",
    "David",
    "Scarlett",
    "Jackson",
    "Grace",
    "Sebastian",
    "Chloe",
    "Aiden",
    "Victoria",
    "Carter",
    "Riley",
    "Wyatt",
    "Aria",
    "Jayden",
    "Lily",
    "John",
    "Aubrey",
    "Luke",
    "Zoey",
    "Dylan",
    "Priya",
    "Arjun",
    "Ananya",
    "Vivek",
    "Diya",
    "Rohan",
    "Aisha",
    "Karan",
    "Kavya",
    "Amit",
    "Neha",
  ];

  const lastNames = [
    "Smith",
    "Johnson",
    "Brown",
    "Taylor",
    "Anderson",
    "Thomas",
    "Jackson",
    "White",
    "Harris",
    "Martin",
    "Thompson",
    "Garcia",
    "Martinez",
    "Robinson",
    "Clark",
    "Rodriguez",
    "Lewis",
    "Lee",
    "Walker",
    "Hall",
    "Kumar",
    "Singh",
    "Patel",
    "Sharma",
    "Verma",
    "Gupta",
    "Reddy",
    "Iyer",
    "Nair",
    "Menon",
  ];

  const jobTitles = {
    tech: [
      "Senior Developer",
      "Developer III",
      "Developer II",
      "Developer I",
      "Staff Developer",
      "Principal Developer",
      "QA Engineer",
      "DevOps Engineer",
      "Technical Lead",
    ],
    services: [
      "Support Specialist II",
      "Support Specialist I",
      "Senior Support Specialist",
      "Customer Success Manager",
      "Implementation Specialist",
    ],
    sales: [
      "Account Executive",
      "Senior Account Executive",
      "Sales Development Rep",
      "Channel Manager",
      "Sales Manager",
    ],
    marketing: [
      "Marketing Specialist",
      "Senior Marketing Specialist",
      "Content Writer",
      "SEO Specialist",
      "Demand Generation Manager",
    ],
    product: [
      "Product Manager",
      "Senior Product Manager",
      "Product Designer",
      "UX Researcher",
    ],
    peopleOps: [
      "HR Coordinator",
      "Talent Acquisition Specialist",
      "People Partner",
      "Payroll Specialist",
    ],
  };

  const usedEmails = new Set<string>();

  if (!shouldSkipEmployees) {
    for (let i = 0; i < 80; i++) {
      let firstName = firstNames[i % firstNames.length];
      let lastName = lastNames[Math.floor(i / 2) % lastNames.length];
      let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${VENDASTA_DOMAIN}`;

      let suffix = 1;
      while (usedEmails.has(email)) {
        email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${suffix}@${VENDASTA_DOMAIN}`;
        suffix++;
      }
      usedEmails.add(email);
      const dept =
        i < 35
          ? tech
          : i < 50
            ? services
            : i < 60
              ? sales
              : i < 68
                ? marketing
                : i < 74
                  ? product
                  : peopleOps;
      const location =
        i % 3 === 0
          ? saskatoon
          : i % 3 === 1
            ? chennai
            : i % 5 === 0
              ? bocaRaton
              : i % 7 === 0
                ? toronto
                : remote;

      const isManager = i % 10 === 0;
      const managerId =
        dept.id === tech.id
          ? executives[1]?.id
          : dept.id === services.id
            ? ceo.id
            : dept.id === sales.id
              ? executives[2]?.id
              : dept.id === marketing.id
                ? ceo.id
                : dept.id === product.id
                  ? ceo.id
                  : executives[0]?.id;

      const titles =
        dept.id === tech.id
          ? jobTitles.tech
          : dept.id === services.id
            ? jobTitles.services
            : dept.id === sales.id
              ? jobTitles.sales
              : dept.id === marketing.id
                ? jobTitles.marketing
                : dept.id === product.id
                  ? jobTitles.product
                  : jobTitles.peopleOps;

      const jobTitle = titles[i % titles.length];
      const jobLevel =
        isManager || jobTitle.includes("Manager")
          ? levels.find((l) => l.code === "M1")!.id
          : jobTitle.includes("Senior") || jobTitle.includes("Staff")
            ? levels.find((l) => l.code === "IC3")!.id
            : jobTitle.includes("Principal")
              ? levels.find((l) => l.code === "IC5")!.id
              : levels.find((l) => l.code === "IC2")!.id;

      const hireYear = 2015 + (i % 9);
      const hireMonth = (i % 12) + 1;
      const hireDay = (i % 28) + 1;

      employeesData.push({
        employeeNumber: `E${String(empNumber++).padStart(3, "0")}`,
        firstName,
        lastName,
        email,
        jobTitle,
        departmentId: dept.id,
        divisionId:
          dept.id === tech.id
            ? rdDiv.id
            : dept.id === services.id
              ? supportDiv.id
              : dept.id === sales.id
                ? channelSalesDiv.id
                : null,
        locationId: location.id,
        managerId,
        hireDate: `${hireYear}-${String(hireMonth).padStart(2, "0")}-${String(hireDay).padStart(2, "0")}`,
        employmentStatus: "full_time" as const,
        jobFamilyId: isManager ? managerFamily.id : icFamily.id,
        jobLevelId: jobLevel,
        accessLevel: (isManager ? "manager" : "employee") as
          | "manager"
          | "employee",
        workPhone:
          location.country === "India"
            ? `+91-44-555-${String(1000 + i).slice(-4)}`
            : `+1-306-555-${String(1000 + i).slice(-4)}`,
        extension: String(200 + i),
        birthDate: `198${(i % 10) + 1}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
        gender: (i % 3 === 0
          ? "male"
          : i % 3 === 1
            ? "female"
            : "prefer_not_to_say") as "male" | "female" | "prefer_not_to_say",
      });
    }
  }

  let allEmployees: any[] = [];

  if (!shouldSkipEmployees && employeesData.length > 0) {
    await db
      .insert(schema.employees)
      .values(employeesData)
      .onConflictDoNothing();
  }

  allEmployees = await db
    .select()
    .from(schema.employees)
    .where(
      sql`email NOT IN ('brendan.king@vendasta.com', 'jean.parchewsky@vendasta.com', 'david.chen@vendasta.com', 'sarah.martinez@vendasta.com', 'raj.patel@vendasta.com')`
    );

  console.log("Creating seats...");

  const existingSeats = await db.select().from(schema.seats);

  if (existingSeats.length === 0) {
    const seatsData = [
      {
        title: "Chief Executive Officer",
        employeeId: ceo.id,
        reportingToSeatId: null,
        departmentId: financeAdmin.id,
        isVacant: false,
      },
      {
        title: "Chief People Officer",
        employeeId: executives[0]?.id || null,
        reportingToSeatId: 1,
        departmentId: peopleOps.id,
        isVacant: false,
      },
      {
        title: "Chief Technology Officer",
        employeeId: executives[1]?.id || null,
        reportingToSeatId: 1,
        departmentId: tech.id,
        isVacant: false,
      },
      {
        title: "VP of Sales",
        employeeId: executives[2]?.id || null,
        reportingToSeatId: 1,
        departmentId: sales.id,
        isVacant: false,
      },
      {
        title: "Director of Engineering - India",
        employeeId: executives[3]?.id || null,
        reportingToSeatId: 3,
        departmentId: tech.id,
        isVacant: false,
      },
      {
        title: "Engineering Manager - Phoenix",
        employeeId: allEmployees[0]?.id || null,
        reportingToSeatId: 3,
        departmentId: tech.id,
        isVacant: allEmployees.length === 0,
      },
      {
        title: "Support Manager",
        employeeId: null,
        reportingToSeatId: 1,
        departmentId: services.id,
        isVacant: true,
      },
    ];

    await db.insert(schema.seats).values(seatsData);
  } else {
    console.log("  Seats already exist, skipping...");
  }

  console.log("Creating time off policies...");

  const policyValues = [
    {
      name: "Vacation - Canada",
      policyType: "vacation" as const,
      country: "Canada",
      accrualRate: "15",
      accrualPeriod: "annual",
      maxCarryover: "5",
    },
    {
      name: "Vacation - US",
      policyType: "vacation" as const,
      country: "United States",
      accrualRate: "12",
      accrualPeriod: "annual",
      maxCarryover: "3",
    },
    {
      name: "Vacation - India",
      policyType: "vacation" as const,
      country: "India",
      accrualRate: "20",
      accrualPeriod: "annual",
      maxCarryover: "10",
    },
    {
      name: "Sick Leave - All",
      policyType: "sick" as const,
      country: "All",
      accrualRate: "10",
      accrualPeriod: "annual",
      maxCarryover: "0",
    },
  ];

  const policyNames = policyValues.map((p) => p.name);
  const existingPolicies = await db
    .select()
    .from(schema.timeOffPolicies)
    .where(inArray(schema.timeOffPolicies.name, policyNames));

  const existingPolicyNames = new Set(existingPolicies.map((p) => p.name));
  const policiesToInsert = policyValues.filter(
    (p) => !existingPolicyNames.has(p.name)
  );

  if (policiesToInsert.length > 0) {
    await db.insert(schema.timeOffPolicies).values(policiesToInsert);
  }

  const policies = await db
    .select()
    .from(schema.timeOffPolicies)
    .where(inArray(schema.timeOffPolicies.name, policyNames));

  console.log("Creating time off balances...");

  const existingBalances = await db.select().from(schema.timeOffBalances);
  const existingBalanceKeys = new Set(
    existingBalances.map((b) => `${b.employeeId}-${b.policyId}`)
  );

  const balances = [];
  for (let i = 0; i < Math.min(40, allEmployees.length); i++) {
    const employee = allEmployees[i];
    const loc = await db
      .select()
      .from(schema.locations)
      .where(sql`id = ${employee.locationId}`)
      .limit(1);
    const policy = policies.find((p) =>
      p.country === "All"
        ? p.name.includes("Sick")
        : p.country === loc[0]?.country
    );
    if (policy) {
      const key = `${employee.id}-${policy.id}`;
      if (!existingBalanceKeys.has(key)) {
        balances.push({
          employeeId: employee.id,
          policyId: policy.id,
          balance: String(Math.floor(Math.random() * 10) + 5),
        });
      }
    }
  }

  if (balances.length > 0) {
    await db.insert(schema.timeOffBalances).values(balances);
  }

  console.log("Creating time off requests...");

  const existingRequests = await db.select().from(schema.timeOffRequests);
  const existingRequestEmployeeIds = new Set(
    existingRequests.map((r) => r.employeeId)
  );

  const requests = [];
  const allBalances = await db.select().from(schema.timeOffBalances);

  for (let i = 0; i < Math.min(15, allEmployees.length); i++) {
    const employee = allEmployees[i];
    if (existingRequestEmployeeIds.has(employee.id)) {
      continue;
    }

    const balance = allBalances.find((b) => b.employeeId === employee.id);
    if (balance) {
      const isPending = i < 5;
      requests.push({
        employeeId: employee.id,
        policyId: balance.policyId,
        startDate: "2026-12-20",
        endDate: "2026-12-27",
        daysRequested: "5",
        status: (isPending ? "pending" : "approved") as "pending" | "approved",
        requestedAt: new Date(),
        reviewedBy: isPending ? null : ceo.id,
        reviewedAt: isPending ? null : new Date(),
      });
    }
  }

  if (requests.length > 0) {
    await db.insert(schema.timeOffRequests).values(requests);
  }

  console.log("Creating onboarding task templates...");

  const templateValues = [
    {
      name: "IT Setup",
      taskType: "onboarding" as const,
      description: "Provision laptop and accounts",
    },
    {
      name: "HR Paperwork",
      taskType: "onboarding" as const,
      description: "Complete tax forms and direct deposit",
    },
    {
      name: "Offboarding Checklist",
      taskType: "offboarding" as const,
      description: "Return equipment and revoke access",
    },
  ];

  const templateNames = templateValues.map((t) => t.name);
  const existingTemplates = await db
    .select()
    .from(schema.taskTemplates)
    .where(inArray(schema.taskTemplates.name, templateNames));

  const existingTemplateNames = new Set(existingTemplates.map((t) => t.name));
  const templatesToInsert = templateValues.filter(
    (t) => !existingTemplateNames.has(t.name)
  );

  if (templatesToInsert.length > 0) {
    await db.insert(schema.taskTemplates).values(templatesToInsert);
  }

  const templates = await db
    .select()
    .from(schema.taskTemplates)
    .where(inArray(schema.taskTemplates.name, templateNames));

  console.log("Creating onboarding tasks...");

  const existingTasks = await db.select().from(schema.employeeTasks);
  const existingTaskKeys = new Set(
    existingTasks.map((t) => `${t.employeeId}-${t.templateId}`)
  );

  const taskData = [];
  for (let i = 0; i < Math.min(10, allEmployees.length); i++) {
    const employee = allEmployees[i];

    const itSetupKey = `${employee.id}-${templates[0].id}`;
    if (!existingTaskKeys.has(itSetupKey)) {
      taskData.push({
        employeeId: employee.id,
        templateId: templates[0].id,
        taskType: "onboarding" as const,
        title: "IT Setup",
        description: "Provision laptop and accounts",
        dueDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        status: (i % 3 === 0 ? "completed" : "pending") as
          | "completed"
          | "pending",
        completedAt: i % 3 === 0 ? new Date() : null,
      });
    }

    const hrPaperworkKey = `${employee.id}-${templates[1].id}`;
    if (!existingTaskKeys.has(hrPaperworkKey)) {
      taskData.push({
        employeeId: employee.id,
        templateId: templates[1].id,
        taskType: "onboarding" as const,
        title: "HR Paperwork",
        description: "Complete tax forms",
        dueDate: new Date(Date.now() + 259200000).toISOString().split("T")[0],
        status: "pending" as const,
        completedAt: null,
      });
    }
  }

  if (taskData.length > 0) {
    await db.insert(schema.employeeTasks).values(taskData);
  }

  console.log("Assigning employees to teams...");

  const existingEmployeeTeams = await db.select().from(schema.employeeTeams);
  const existingEmployeeTeamKeys = new Set(
    existingEmployeeTeams.map((et) => `${et.employeeId}-${et.teamId}`)
  );

  const teamData = [];
  for (let i = 0; i < Math.min(30, allEmployees.length); i++) {
    const employee = allEmployees[i];
    const team =
      i < 10
        ? phoenixTeam
        : i < 20
          ? seoTeam
          : i < 25
            ? supportTeam
            : sreTeam;

    const key = `${employee.id}-${team.id}`;
    if (!existingEmployeeTeamKeys.has(key)) {
      teamData.push({
        employeeId: employee.id,
        teamId: team.id,
      });
    }
  }

  if (teamData.length > 0) {
    await db.insert(schema.employeeTeams).values(teamData);
  }

  console.log("✅ Seeding completed!");
  console.log(
    `Created ${allEmployees.length + executives.length + 1} employees`
  );
  console.log(`Created ${policies.length} time off policies`);
  console.log(`Created ${balances.length} time off balances`);
  console.log(`Created ${requests.length} time off requests`);
  console.log(`Created ${taskData.length} onboarding tasks`);

  return {
    success: true,
    counts: {
      employees: allEmployees.length + executives.length + 1,
      policies: policies.length,
      balances: balances.length,
      requests: requests.length,
      tasks: taskData.length,
    },
  };
}
