import { db } from "./db";
import * as schema from "./db/schema";
import { sql, eq, inArray, and } from "drizzle-orm";
import { runMigrations } from "./migrate";

const VENDASTA_DOMAIN = "vendasta.com";

export async function runSeed(options: { reset?: boolean } = {}) {
  const { reset = false } = options;

  // Run migrations first to ensure schema is up to date
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  
  try {
    await runMigrations(process.env.DATABASE_URL);
  } catch (error) {
    console.error("Migration failed, cannot proceed with seed:", error);
    throw error;
  }

  console.log("🌱 Seeding database...");

  if (reset) {
    console.log("⚠️  Resetting database (--reset flag detected)...");

    // Delete document blobs before truncating documents table
    try {
      const { documents } = await import("@/lib/db/schema");
      const existingDocs = await db.select({ fileUrl: documents.fileUrl }).from(documents);
      
      if (existingDocs.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
        const { del } = await import("@vercel/blob");
        let deletedCount = 0;
        for (const doc of existingDocs) {
          if (doc.fileUrl) {
            try {
              await del(doc.fileUrl);
              deletedCount++;
            } catch (err) {
              // Tolerate blob deletion failures (orphans are acceptable)
              console.log(`Skipped blob deletion: ${doc.fileUrl}`);
            }
          }
        }
        console.log(`Deleted ${deletedCount} document blobs`);
      }
    } catch (err) {
      console.log("Skipped blob cleanup (tolerable)");
    }

    await db.execute(sql`TRUNCATE TABLE audit_logs CASCADE`);
    await db.execute(sql`TRUNCATE TABLE documents CASCADE`);
    await db.execute(sql`TRUNCATE TABLE enps_responses CASCADE`);
    await db.execute(sql`TRUNCATE TABLE enps_survey_participants CASCADE`);
    await db.execute(sql`TRUNCATE TABLE enps_surveys CASCADE`);
    await db.execute(sql`TRUNCATE TABLE training_completions CASCADE`);
    await db.execute(sql`TRUNCATE TABLE training_courses CASCADE`);
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
    await db.execute(sql`TRUNCATE TABLE offer_letters CASCADE`);
    await db.execute(sql`TRUNCATE TABLE candidate_notes CASCADE`);
    await db.execute(sql`TRUNCATE TABLE candidates CASCADE`);
    await db.execute(sql`TRUNCATE TABLE job_openings CASCADE`);
    await db.execute(sql`TRUNCATE TABLE approval_workflow_steps CASCADE`);
    await db.execute(sql`TRUNCATE TABLE approval_workflows CASCADE`);
    await db.execute(sql`TRUNCATE TABLE access_levels CASCADE`);
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
      name: "Senior Leadership",
      description: "Executive leadership team",
    },
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

  const seniorLeadership = allDepartments.find((d) => d.name === "Senior Leadership")!;
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
    { name: "Executive", description: "Executive leadership" },
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

  const executiveDiv = allDivisions.find((d) => d.name === "Executive")!;
  const rdDiv = allDivisions.find((d) => d.name === "R&D")!;
  const supportDiv = allDivisions.find((d) => d.name === "Support")!;
  const channelSalesDiv = allDivisions.find((d) => d.name === "Channel Sales")!;
  const corpMarketingDiv = allDivisions.find(
    (d) => d.name === "Corporate Marketing"
  )!;
  const financeDiv = allDivisions.find((d) => d.name === "Finance")!;

  console.log("Creating access levels...");

  const accessLevelValues = [
    {
      name: "Employee",
      code: "employee",
      description: "Standard employee access",
      canViewCompensation: false,
      canEditCompensation: false,
      canViewSensitivePersonalInfo: false,
      canEditSensitivePersonalInfo: false,
      canViewBankInfo: false,
      canEditBankInfo: false,
      canManageUsers: false,
      canManageSettings: false,
      canApproveTimeOff: false,
      canApproveCompensationChanges: false,
    },
    {
      name: "Manager",
      code: "manager",
      description: "Team manager with approval rights",
      canViewCompensation: false,
      canEditCompensation: false,
      canViewSensitivePersonalInfo: false,
      canEditSensitivePersonalInfo: false,
      canViewBankInfo: false,
      canEditBankInfo: false,
      canManageUsers: false,
      canManageSettings: false,
      canApproveTimeOff: true,
      canApproveCompensationChanges: false,
    },
    {
      name: "Admin",
      code: "admin",
      description: "HR administrator with full people management",
      canViewCompensation: true,
      canEditCompensation: true,
      canViewSensitivePersonalInfo: true,
      canEditSensitivePersonalInfo: true,
      canViewBankInfo: true,
      canEditBankInfo: true,
      canManageUsers: true,
      canManageSettings: false,
      canApproveTimeOff: true,
      canApproveCompensationChanges: true,
    },
    {
      name: "Full Admin",
      code: "full_admin",
      description: "System administrator with all permissions",
      canViewCompensation: true,
      canEditCompensation: true,
      canViewSensitivePersonalInfo: true,
      canEditSensitivePersonalInfo: true,
      canViewBankInfo: true,
      canEditBankInfo: true,
      canManageUsers: true,
      canManageSettings: true,
      canApproveTimeOff: true,
      canApproveCompensationChanges: true,
    },
  ];

  await db
    .insert(schema.accessLevels)
    .values(accessLevelValues)
    .onConflictDoNothing();

  console.log("Creating approval workflows...");

  const workflowValues = [
    {
      name: "Time Off Approval",
      type: "time_off" as const,
      enabled: true,
      requiresManagerApproval: true,
      requiresAdminApproval: false,
      description: "Requires manager approval for time-off requests",
    },
    {
      name: "Compensation Change Approval",
      type: "compensation_change" as const,
      enabled: true,
      requiresManagerApproval: true,
      requiresAdminApproval: true,
      description: "Requires both manager and admin approval for compensation changes",
    },
    {
      name: "Job Info Change Approval",
      type: "job_info_change" as const,
      enabled: false,
      requiresManagerApproval: false,
      requiresAdminApproval: true,
      description: "Requires admin approval for job information changes",
    },
  ];

  await db
    .insert(schema.approvalWorkflows)
    .values(workflowValues)
    .onConflictDoNothing();

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
    departmentId: seniorLeadership.id,
    divisionId: executiveDiv.id,
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
  const departmentDirectors: Record<number, number | null> = {}; // Track first employee per dept

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
      const isFirstInDept = !departmentDirectors[dept.id];
      
      // Department heads (executives)
      const deptHead =
        dept.id === tech.id
          ? executives[1]?.id // CTO
          : dept.id === services.id
            ? executives[3]?.id // Use 4th exec as Services head
            : dept.id === sales.id
              ? executives[2]?.id // VP of Sales
              : dept.id === marketing.id
                ? ceo.id // Marketing reports to CEO
                : dept.id === product.id
                  ? ceo.id // Product reports to CEO for now
                  : executives[0]?.id; // CPO for people ops
      
      // First person in each department reports to exec, rest report to that director
      const managerId = isFirstInDept ? deptHead : departmentDirectors[dept.id];

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
    
    console.log("Fixing reporting structure - routing through department directors...");
    // Get all non-executive employees by department
    for (const dept of [tech, services, sales, marketing, product, peopleOps]) {
      const deptEmployees = await db
        .select()
        .from(schema.employees)
        .where(
          and(
            eq(schema.employees.departmentId, dept.id),
            sql`${schema.employees.id} NOT IN (${ceo.id}, ${executives[0]?.id || 0}, ${executives[1]?.id || 0}, ${executives[2]?.id || 0}, ${executives[3]?.id || 0})`
          )
        )
        .orderBy(schema.employees.id);
      
      if (deptEmployees.length > 1) {
        // First employee is the director - others report to them
        const directorId = deptEmployees[0].id;
        const teamMemberIds = deptEmployees.slice(1).map(e => e.id);
        
        if (teamMemberIds.length > 0) {
          await db
            .update(schema.employees)
            .set({ managerId: directorId })
            .where(inArray(schema.employees.id, teamMemberIds));
        }
      }
    }
  }

  // Get all employees including CEO and executives for time-off balances
  allEmployees = await db
    .select()
    .from(schema.employees);

  console.log("Creating seats...");

  const existingSeats = await db.select().from(schema.seats);

  if (existingSeats.length === 0) {
    const seatsData = [
      {
        title: "Chief Executive Officer",
        assignedEmployeeId: ceo.id,
        parentSeatId: null,
        accountabilities: [
          "Set company vision and strategy",
          "Lead executive team",
          "Ensure company profitability and growth",
          "Build and maintain company culture",
        ],
        isOpen: false,
      },
      {
        title: "Chief People Officer",
        assignedEmployeeId: executives[0]?.id || null,
        parentSeatId: 1,
        accountabilities: [
          "Develop and execute people strategy",
          "Own recruiting and retention",
          "Manage performance management systems",
          "Ensure compliance with employment law",
        ],
        isOpen: !executives[0],
      },
      {
        title: "Chief Technology Officer",
        assignedEmployeeId: executives[1]?.id || null,
        parentSeatId: 1,
        accountabilities: [
          "Define technical architecture and strategy",
          "Lead engineering teams",
          "Ensure system reliability and security",
          "Drive technical innovation",
        ],
        isOpen: !executives[1],
      },
      {
        title: "VP of Sales",
        assignedEmployeeId: executives[2]?.id || null,
        parentSeatId: 1,
        accountabilities: [
          "Hit quarterly sales targets",
          "Build and scale sales team",
          "Develop sales processes and playbooks",
          "Own customer acquisition strategy",
        ],
        isOpen: !executives[2],
      },
      {
        title: "Director of Engineering - India",
        assignedEmployeeId: executives[3]?.id || null,
        parentSeatId: 3,
        accountabilities: [
          "Manage India engineering team",
          "Deliver on product roadmap commitments",
          "Build engineering culture in Chennai",
          "Partner with product on feature delivery",
        ],
        isOpen: !executives[3],
      },
      {
        title: "Engineering Manager - Phoenix",
        assignedEmployeeId: allEmployees[0]?.id || null,
        parentSeatId: 3,
        accountabilities: [
          "Lead Phoenix team delivery",
          "Mentor and grow engineers",
          "Ensure code quality and technical excellence",
          "Own sprint planning and execution",
        ],
        isOpen: allEmployees.length === 0,
      },
      {
        title: "Support Manager",
        assignedEmployeeId: null,
        parentSeatId: 1,
        accountabilities: [
          "Manage support team and queue",
          "Hit SLA targets",
          "Improve customer satisfaction scores",
          "Build support knowledge base",
        ],
        isOpen: true,
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
        // Calculate tenure-based balance
        const hireDate = new Date(employee.hireDate);
        const now = new Date("2026-11-08");
        const yearsOfService = (now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        
        let baseBalance = 15; // < 2 years
        if (yearsOfService >= 5) {
          baseBalance = 25; // > 5 years
        } else if (yearsOfService >= 2) {
          baseBalance = 20; // 2-5 years
        }
        
        balances.push({
          employeeId: employee.id,
          policyId: policy.id,
          balance: String(baseBalance),
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

  console.log("Creating job openings...");

  const existingJobOpenings = await db
    .select()
    .from(schema.jobOpenings);

  let jobOpeningsCreated = 0;
  if (existingJobOpenings.length === 0) {
    const openingsData = [
      {
        title: "Senior Software Engineer",
        departmentId: tech.id,
        locationId: saskatoon.id,
        hiringLeadId: executives[1]?.id || ceo.id,
        status: "open" as const,
        employmentType: "full_time",
        description: "We are looking for an experienced software engineer to join our growing team. You will work on building scalable web applications using modern technologies.",
        requirements: "• 5+ years of software development experience\n• Strong knowledge of React, TypeScript, and Node.js\n• Experience with PostgreSQL and cloud platforms\n• Excellent communication skills",
        openDate: "2026-11-01",
      },
      {
        title: "Product Designer",
        departmentId: product.id,
        locationId: remote.id,
        hiringLeadId: ceo.id,
        status: "open" as const,
        employmentType: "full_time",
        description: "Join our product team to create beautiful, intuitive user experiences. You'll work closely with engineers and product managers to bring ideas to life.",
        requirements: "• 3+ years of product design experience\n• Proficiency in Figma and design systems\n• Strong portfolio demonstrating UX/UI work\n• Understanding of front-end technologies",
        openDate: "2026-10-15",
      },
      {
        title: "Customer Success Manager",
        departmentId: services.id,
        locationId: bocaRaton.id,
        hiringLeadId: executives[3]?.id || ceo.id,
        status: "open" as const,
        employmentType: "full_time",
        description: "Help our customers achieve their goals by providing exceptional support and guidance. Build strong relationships and drive product adoption.",
        requirements: "• 2+ years in customer success or account management\n• Excellent communication and problem-solving skills\n• Experience with B2B SaaS products\n• Ability to manage multiple accounts",
        openDate: "2026-11-05",
      },
      {
        title: "Data Analyst",
        departmentId: tech.id,
        locationId: chennai.id,
        hiringLeadId: executives[1]?.id || ceo.id,
        status: "draft" as const,
        employmentType: "full_time",
        description: "Analyze data to drive business insights and inform product decisions. Work with large datasets and build dashboards.",
        requirements: "• 2+ years of data analysis experience\n• SQL expertise required\n• Experience with BI tools (Tableau, Looker, etc.)\n• Python or R knowledge is a plus",
      },
    ];

    const insertedOpenings = await db
      .insert(schema.jobOpenings)
      .values(openingsData)
      .returning();
    jobOpeningsCreated = insertedOpenings.length;

    console.log("Creating candidates...");

    const candidatesData = [
      {
        jobOpeningId: insertedOpenings[0].id,
        firstName: "Sarah",
        lastName: "Johnson",
        email: "sarah.johnson@example.com",
        phone: "+1-416-555-0123",
        source: "linkedin" as const,
        stage: "interview" as const,
        rating: 4,
        appliedAt: new Date("2026-11-02"),
      },
      {
        jobOpeningId: insertedOpenings[0].id,
        firstName: "Michael",
        lastName: "Chen",
        email: "michael.chen@example.com",
        phone: "+1-647-555-0456",
        source: "referral" as const,
        stage: "offer" as const,
        rating: 5,
        appliedAt: new Date("2026-11-01"),
      },
      {
        jobOpeningId: insertedOpenings[0].id,
        firstName: "Emily",
        lastName: "Rodriguez",
        email: "emily.rodriguez@example.com",
        source: "indeed" as const,
        stage: "new" as const,
        appliedAt: new Date("2026-11-06"),
      },
      {
        jobOpeningId: insertedOpenings[1].id,
        firstName: "Alex",
        lastName: "Kim",
        email: "alex.kim@example.com",
        source: "linkedin" as const,
        stage: "phone_screen" as const,
        rating: 3,
        appliedAt: new Date("2026-10-20"),
      },
      {
        jobOpeningId: insertedOpenings[2].id,
        firstName: "Jessica",
        lastName: "Taylor",
        email: "jessica.taylor@example.com",
        phone: "+1-561-555-0789",
        source: "direct" as const,
        stage: "interview" as const,
        rating: 4,
        appliedAt: new Date("2026-11-07"),
      },
    ];

    await db.insert(schema.candidates).values(candidatesData);
  }

  console.log("Creating training courses...");
  
  const trainingCoursesData = [
    {
      name: "Information Security Awareness",
      description: "Annual mandatory security training covering data protection, phishing awareness, and security best practices.",
      duration: 60,
      isRequired: true,
      category: "Compliance",
      createdBy: ceo.id,
    },
    {
      name: "Leadership Development Program",
      description: "Comprehensive leadership training for managers and aspiring leaders.",
      duration: 480,
      isRequired: false,
      category: "Leadership",
      createdBy: ceo.id,
    },
    {
      name: "Diversity and Inclusion Training",
      description: "Building an inclusive workplace through awareness and actionable practices.",
      duration: 90,
      isRequired: true,
      category: "Culture",
      createdBy: ceo.id,
    },
    {
      name: "Time Management Skills",
      description: "Practical techniques for prioritization, planning, and productivity.",
      duration: 120,
      isRequired: false,
      category: "Professional Development",
      createdBy: ceo.id,
    },
    {
      name: "Workplace Harassment Prevention",
      description: "Required annual training on recognizing and preventing workplace harassment.",
      duration: 45,
      isRequired: true,
      category: "Compliance",
      createdBy: ceo.id,
    },
  ];

  const insertedCourses = await db
    .insert(schema.trainingCourses)
    .values(trainingCoursesData)
    .returning();

  console.log("Creating training completions...");
  
  // Assign completions to random employees
  const trainingCompletions = [];
  for (const course of insertedCourses) {
    const completionCount = course.isRequired ? Math.floor(allEmployees.length * 0.85) : Math.floor(allEmployees.length * 0.30);
    const selectedEmployees = allEmployees.slice(0, completionCount);
    
    for (const emp of selectedEmployees) {
      trainingCompletions.push({
        courseId: course.id,
        employeeId: emp.id,
        completedAt: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000), // Random date in last 6 months
        score: Math.floor(Math.random() * 20) + 80, // 80-100
        status: "completed" as const,
      });
    }
  }

  if (trainingCompletions.length > 0) {
    await db.insert(schema.trainingCompletions).values(trainingCompletions);
  }

  console.log("Creating eNPS survey...");
  
  const [enpsSurvey] = await db
    .insert(schema.enpsSurveys)
    .values({
      name: "Q4 2026 Employee Net Promoter Score",
      question: "On a scale of 0-10, how likely are you to recommend Vendasta as a great place to work?",
      isActive: true,
    })
    .returning();

  // Create participant records for all active employees
  const enpsParticipants = allEmployees.map((emp) => ({
    surveyId: enpsSurvey.id,
    employeeId: emp.id,
    hasResponded: Math.random() < 0.65, // 65% response rate
    respondedAt: Math.random() < 0.65 ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) : null,
  }));

  await db.insert(schema.enpsSurveyParticipants).values(enpsParticipants);

  // Create anonymous responses for those who responded
  const enpsResponses = enpsParticipants
    .filter((p) => p.hasResponded)
    .map(() => {
      const score = Math.random() < 0.7 ? Math.floor(Math.random() * 2) + 9 : Math.floor(Math.random() * 11); // 70% promoters
      return {
        surveyId: enpsSurvey.id,
        score,
        comment: score >= 9 ? "Great company culture and growth opportunities!" : score <= 6 ? "Some areas could be improved." : null,
      };
    });

  if (enpsResponses.length > 0) {
    await db.insert(schema.enpsResponses).values(enpsResponses);
  }

  console.log("Creating sample documents...");
  
  // Helper to create and upload placeholder documents
  const createPlaceholderBlob = async (title: string, content: string) => {
    try {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.log("Skipping blob upload (no token)");
        return null;
      }
      
      const { put } = await import("@vercel/blob");
      const blob = await put(`seed/${title}.txt`, content, {
        access: "private",
        addRandomSuffix: true,
      });
      return blob.url;
    } catch (error) {
      console.error(`Failed to upload ${title}:`, error);
      return null;
    }
  };

  const documentsData = await Promise.all([
    {
      employeeId: ceo.id,
      title: "Employment Agreement - CEO",
      category: "contract" as const,
      status: "signed" as const,
      signedAt: new Date("2020-01-15"),
      signedBy: ceo.id,
      uploadedBy: ceo.id,
      fileUrl: await createPlaceholderBlob(
        "employment-agreement-ceo",
        `EMPLOYMENT AGREEMENT\n\nThis Employment Agreement is entered into on January 15, 2020.\n\nEmployee: ${ceo.firstName} ${ceo.lastName}\nPosition: Chief Executive Officer\n\nTerms and conditions...\n`
      ),
    },
    {
      employeeId: executives[0]?.id || ceo.id,
      title: "2026 Performance Review",
      category: "performance" as const,
      status: "draft" as const,
      uploadedBy: ceo.id,
      fileUrl: await createPlaceholderBlob(
        "performance-review-2026",
        `PERFORMANCE REVIEW 2026\n\nEmployee: ${executives[0]?.firstName || ceo.firstName} ${executives[0]?.lastName || ceo.lastName}\n\nRating: Exceeds Expectations\n\nComments: Strong performance across all key areas...\n`
      ),
    },
    {
      employeeId: allEmployees[5]?.id || ceo.id,
      title: "Signed NDA",
      category: "policy" as const,
      status: "signed" as const,
      signedAt: new Date("2025-06-01"),
      signedBy: allEmployees[5]?.id || ceo.id,
      uploadedBy: ceo.id,
      fileUrl: await createPlaceholderBlob(
        "nda-agreement",
        `NON-DISCLOSURE AGREEMENT\n\nSigned: June 1, 2025\n\nEmployee: ${allEmployees[5]?.firstName || ceo.firstName} ${allEmployees[5]?.lastName || ceo.lastName}\n\nConfidentiality terms...\n`
      ),
    },
    {
      employeeId: allEmployees[10]?.id || ceo.id,
      title: "Benefits Enrollment Form 2027",
      category: "benefits" as const,
      status: "pending_signature" as const,
      uploadedBy: allEmployees[10]?.id || ceo.id,
      fileUrl: await createPlaceholderBlob(
        "benefits-enrollment-2027",
        `BENEFITS ENROLLMENT FORM 2027\n\nEmployee: ${allEmployees[10]?.firstName || ceo.firstName} ${allEmployees[10]?.lastName || ceo.lastName}\n\nHealth Insurance: Yes\nDental: Yes\n401k Contribution: 5%\n\nPlease sign below...\n`
      ),
    },
  ]);

  await db.insert(schema.documents).values(documentsData);

  console.log("Creating holidays...");

  const holidaysData = [
    // Canada 2027
    { name: "New Year's Day", date: "2027-01-01", country: "CA" },
    { name: "Good Friday", date: "2027-04-02", country: "CA" },
    { name: "Victoria Day", date: "2027-05-24", country: "CA" },
    { name: "Canada Day", date: "2027-07-01", country: "CA" },
    { name: "Labour Day", date: "2027-09-06", country: "CA" },
    { name: "Thanksgiving", date: "2027-10-11", country: "CA" },
    { name: "Remembrance Day", date: "2027-11-11", country: "CA" },
    { name: "Christmas Day", date: "2027-12-25", country: "CA" },
    { name: "Boxing Day", date: "2027-12-26", country: "CA" },
    
    // United States 2027
    { name: "New Year's Day", date: "2027-01-01", country: "US" },
    { name: "Martin Luther King Jr. Day", date: "2027-01-18", country: "US" },
    { name: "Presidents' Day", date: "2027-02-15", country: "US" },
    { name: "Memorial Day", date: "2027-05-31", country: "US" },
    { name: "Independence Day", date: "2027-07-04", country: "US" },
    { name: "Labor Day", date: "2027-09-06", country: "US" },
    { name: "Columbus Day", date: "2027-10-11", country: "US" },
    { name: "Veterans Day", date: "2027-11-11", country: "US" },
    { name: "Thanksgiving", date: "2027-11-25", country: "US" },
    { name: "Christmas Day", date: "2027-12-25", country: "US" },
    
    // India 2027
    { name: "Republic Day", date: "2027-01-26", country: "IN" },
    { name: "Holi", date: "2027-03-29", country: "IN" },
    { name: "Good Friday", date: "2027-04-02", country: "IN" },
    { name: "Independence Day", date: "2027-08-15", country: "IN" },
    { name: "Gandhi Jayanti", date: "2027-10-02", country: "IN" },
    { name: "Diwali", date: "2027-11-04", country: "IN" },
    { name: "Christmas Day", date: "2027-12-25", country: "IN" },
  ];

  await db
    .insert(schema.holidays)
    .values(
      holidaysData.map((h) => ({
        ...h,
        isRecurring: true,
        locationId: null,
      }))
    )
    .onConflictDoNothing();

  console.log("✅ Seeding completed!");
  console.log(
    `Created ${allEmployees.length} employees`
  );
  console.log(`Created ${policies.length} time off policies`);
  console.log(`Created ${balances.length} time off balances`);
  console.log(`Created ${requests.length} time off requests`);
  console.log(`Created ${taskData.length} onboarding tasks`);
  console.log(`Created ${jobOpeningsCreated} job openings`);
  console.log(`Created ${insertedCourses.length} training courses`);
  console.log(`Created ${trainingCompletions.length} training completions`);
  console.log(`Created 1 eNPS survey with ${enpsParticipants.length} participants`);
  console.log(`Created ${documentsData.length} sample documents`);

  return {
    success: true,
    counts: {
      employees: allEmployees.length,
      policies: policies.length,
      balances: balances.length,
      requests: requests.length,
      tasks: taskData.length,
      jobOpenings: jobOpeningsCreated,
      trainingCourses: insertedCourses.length,
      trainingCompletions: trainingCompletions.length,
      enpsSurveys: 1,
      documents: documentsData.length,
    },
  };
}
