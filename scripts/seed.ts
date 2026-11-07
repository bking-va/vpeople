import { db } from "../lib/db";
import * as schema from "../lib/db/schema";

const VENDASTA_DOMAIN = "vendasta.com";

async function seed() {
  console.log("🌱 Seeding database...");

  console.log("Creating locations...");
  const [saskatoon, chennai, bocaRaton, toronto, remote] = await db
    .insert(schema.locations)
    .values([
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
    ])
    .returning();

  console.log("Creating departments...");
  const [tech, services, sales, marketing, financeAdmin, peopleOps, product] =
    await db
      .insert(schema.departments)
      .values([
        {
          name: "Technology",
          description: "Engineering and technical operations",
        },
        {
          name: "Vendasta Services",
          description: "Customer-facing services and support",
        },
        { name: "Sales", description: "Revenue and business development" },
        {
          name: "Marketing",
          description: "Marketing and demand generation",
        },
        {
          name: "Finance & Admin",
          description: "Finance, legal, and administrative",
        },
        {
          name: "People Operations",
          description: "HR and people management",
        },
        { name: "Product", description: "Product management and design" },
      ])
      .returning();

  console.log("Creating divisions...");
  const [rdDiv, supportDiv, channelSalesDiv, corpMarketingDiv, financeDiv] =
    await db
      .insert(schema.divisions)
      .values([
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
      ])
      .returning();

  console.log("Creating teams...");
  const [phoenixTeam, seoTeam, supportTeam, sreTeam] = await db
    .insert(schema.teams)
    .values([
      { name: "Phoenix", description: "Core platform team" },
      { name: "Website & SEO Managed Services", description: "SEO services" },
      { name: "Support - Tier 1", description: "Front-line support" },
      { name: "SRE", description: "Site Reliability Engineering" },
    ])
    .returning();

  console.log("Creating job families...");
  const [icFamily, managerFamily, contractorFamily] = await db
    .insert(schema.jobFamilies)
    .values([
      { name: "Individual Contributor", description: "IC track" },
      { name: "Manager", description: "Management track" },
      { name: "Contractor", description: "Contract positions" },
    ])
    .returning();

  console.log("Creating job levels...");
  const levels = await db
    .insert(schema.jobLevels)
    .values([
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
      { code: "M6", name: "M6", description: "C-Suite" },
    ])
    .returning();

  console.log("Creating CEO...");
  const [ceo] = await db
    .insert(schema.employees)
    .values([
      {
        employeeNumber: "E001",
        firstName: "Brendan",
        lastName: "King",
        email: `brendan.king@${VENDASTA_DOMAIN}`,
        jobTitle: "Chief Executive Officer",
        departmentId: financeAdmin.id,
        locationId: saskatoon.id,
        hireDate: "2008-03-15",
        employmentStatus: "full_time",
        jobFamilyId: managerFamily.id,
        jobLevelId: levels.find((l) => l.code === "M6")!.id,
        accessLevel: "full_admin",
        workPhone: "+1-306-955-5512",
        extension: "101",
      },
    ])
    .returning();

  console.log("Creating C-suite and VPs...");
  const executives = await db
    .insert(schema.employees)
    .values([
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
        employmentStatus: "full_time",
        jobFamilyId: managerFamily.id,
        jobLevelId: levels.find((l) => l.code === "M6")!.id,
        accessLevel: "full_admin",
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
        employmentStatus: "full_time",
        jobFamilyId: managerFamily.id,
        jobLevelId: levels.find((l) => l.code === "M6")!.id,
        accessLevel: "full_admin",
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
        employmentStatus: "full_time",
        jobFamilyId: managerFamily.id,
        jobLevelId: levels.find((l) => l.code === "M4")!.id,
        accessLevel: "regional_view",
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
        employmentStatus: "full_time",
        jobFamilyId: managerFamily.id,
        jobLevelId: levels.find((l) => l.code === "M3")!.id,
        accessLevel: "regional_view",
        workPhone: "+91-44-555-0100",
        extension: "201",
      },
    ])
    .returning();

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

  for (let i = 0; i < 80; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[Math.floor(i / 2) % lastNames.length];
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

    const jobTitle = isManager
      ? `${dept.name} Manager`
      : titles[i % titles.length];
    const jobLevel = isManager
      ? levels.find((l) => l.code === "M1")!.id
      : i % 4 === 0
        ? levels.find((l) => l.code === "IC3")!.id
        : i % 4 === 1
          ? levels.find((l) => l.code === "IC2")!.id
          : i % 4 === 2
            ? levels.find((l) => l.code === "IC4")!.id
            : levels.find((l) => l.code === "IC1")!.id;

    const hireYear = 2018 + (i % 7);
    const hireMonth = (i % 12) + 1;
    const hireDay = (i % 28) + 1;

    employeesData.push({
      employeeNumber: `E${String(empNumber++).padStart(3, "0")}`,
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${VENDASTA_DOMAIN}`,
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
      accessLevel: (isManager ? "manager" : "employee") as "manager" | "employee",
      workPhone: location.country === "India" 
        ? `+91-44-555-${String(1000 + i).slice(-4)}`
        : `+1-306-555-${String(1000 + i).slice(-4)}`,
      extension: String(200 + i),
      birthDate: `198${(i % 10) + 1}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      gender: (i % 3 === 0 ? "male" : i % 3 === 1 ? "female" : "prefer_not_to_say") as "male" | "female" | "prefer_not_to_say",
    });
  }

  const allEmployees = await db
    .insert(schema.employees)
    .values(employeesData)
    .returning();

  console.log("Creating seats (VOS accountability chart)...");
  const ceoSeat = await db
    .insert(schema.seats)
    .values([
      {
        title: "Chief Executive Officer",
        accountabilities: [
          "Overall company strategy and vision",
          "Board relations and investor management",
          "Executive team leadership",
        ],
        assignedEmployeeId: ceo.id,
        isOpen: false,
      },
    ])
    .returning();

  const executiveSeats = await db
    .insert(schema.seats)
    .values([
      {
        title: "Chief People Officer",
        accountabilities: [
          "People strategy and culture",
          "Talent acquisition and retention",
          "Compensation and benefits",
        ],
        parentSeatId: ceoSeat[0].id,
        assignedEmployeeId: executives[0].id,
        isOpen: false,
      },
      {
        title: "Chief Technology Officer",
        accountabilities: [
          "Technology strategy and roadmap",
          "Engineering excellence",
          "Platform architecture and scalability",
        ],
        parentSeatId: ceoSeat[0].id,
        assignedEmployeeId: executives[1].id,
        isOpen: false,
      },
      {
        title: "VP of Sales",
        accountabilities: [
          "Revenue growth and forecasting",
          "Sales team performance",
          "Customer acquisition strategy",
        ],
        parentSeatId: ceoSeat[0].id,
        assignedEmployeeId: executives[2].id,
        isOpen: false,
      },
      {
        title: "Director of Engineering - India",
        accountabilities: [
          "India engineering operations",
          "Team growth and development",
          "Delivery excellence",
        ],
        parentSeatId: ceoSeat[0].id,
        assignedEmployeeId: executives[3].id,
        isOpen: false,
      },
      {
        title: "Director of Product (Open)",
        accountabilities: [
          "Product strategy and roadmap",
          "User experience and design",
          "Market research and validation",
        ],
        parentSeatId: ceoSeat[0].id,
        assignedEmployeeId: null,
        isOpen: true,
      },
    ])
    .returning();

  console.log("Creating time off policies...");
  const policies = await db
    .insert(schema.timeOffPolicies)
    .values([
      {
        name: "Canada - Vacation A",
        policyType: "Vacation",
        country: "Canada",
        accrualRate: "0.8333",
        accrualPeriod: "monthly",
        maxCarryover: "5.0",
        maxBalance: "20.0",
        requiresApproval: true,
        description: "10 days per year vacation for Canadian employees",
      },
      {
        name: "Canada - Vacation B",
        policyType: "Vacation",
        country: "Canada",
        accrualRate: "1.25",
        accrualPeriod: "monthly",
        maxCarryover: "5.0",
        maxBalance: "25.0",
        requiresApproval: true,
        description: "15 days per year vacation for senior Canadian employees",
      },
      {
        name: "Flex Days",
        policyType: "Flex",
        country: null,
        accrualRate: "0.5",
        accrualPeriod: "monthly",
        maxCarryover: "0.0",
        maxBalance: "6.0",
        requiresApproval: true,
        description: "6 flex days per year for all employees",
      },
      {
        name: "Sick - Canada",
        policyType: "Sick",
        country: "Canada",
        accrualRate: "0.8333",
        accrualPeriod: "monthly",
        maxCarryover: "10.0",
        maxBalance: "50.0",
        requiresApproval: false,
        description: "Sick leave for Canadian employees",
      },
      {
        name: "India - PTO",
        policyType: "Paid Time Off",
        country: "India",
        accrualRate: "1.6667",
        accrualPeriod: "monthly",
        maxCarryover: "5.0",
        maxBalance: "25.0",
        requiresApproval: true,
        description: "20 days PTO for India employees",
      },
      {
        name: "US PTO A",
        policyType: "Paid Time Off",
        country: "United States",
        accrualRate: "1.25",
        accrualPeriod: "monthly",
        maxCarryover: "5.0",
        maxBalance: "20.0",
        requiresApproval: true,
        description: "15 days PTO for US employees",
      },
    ])
    .returning();

  console.log("Creating time off balances...");
  const balances = [];
  for (const employee of [...executives, ...allEmployees]) {
    const country =
      employee.locationId === chennai.id
        ? "India"
        : employee.locationId === bocaRaton.id
          ? "United States"
          : "Canada";

    if (country === "Canada") {
      balances.push({
        employeeId: employee.id,
        policyId: policies[0].id,
        balance: String(5 + Math.random() * 10),
      });
      balances.push({
        employeeId: employee.id,
        policyId: policies[2].id,
        balance: String(Math.random() * 6),
      });
      balances.push({
        employeeId: employee.id,
        policyId: policies[3].id,
        balance: String(Math.random() * 10),
      });
    } else if (country === "India") {
      balances.push({
        employeeId: employee.id,
        policyId: policies[4].id,
        balance: String(8 + Math.random() * 12),
      });
      balances.push({
        employeeId: employee.id,
        policyId: policies[2].id,
        balance: String(Math.random() * 6),
      });
    } else if (country === "United States") {
      balances.push({
        employeeId: employee.id,
        policyId: policies[5].id,
        balance: String(5 + Math.random() * 15),
      });
      balances.push({
        employeeId: employee.id,
        policyId: policies[2].id,
        balance: String(Math.random() * 6),
      });
    }
  }

  await db.insert(schema.timeOffBalances).values(balances);

  console.log("Creating time off requests...");
  const requests = [];
  const sampleEmployees = [executives[0], executives[1], ...allEmployees.slice(0, 20)];
  
  for (let i = 0; i < sampleEmployees.length; i++) {
    const employee = sampleEmployees[i];
    const balance = balances.find((b) => b.employeeId === employee.id);
    if (!balance) continue;

    const status = (i % 4 === 0 ? "pending" : i % 4 === 1 ? "approved" : "approved") as "pending" | "approved";
    const startDate = new Date(2026, 10, 15 + i);
    const endDate = new Date(2026, 10, 16 + i + Math.floor(i / 5));
    const days = Math.floor(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    requests.push({
      employeeId: employee.id,
      policyId: balance.policyId,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      daysRequested: String(days),
      status,
      notes: i % 3 === 0 ? "Family vacation" : i % 3 === 1 ? "Personal day" : null,
      reviewedBy: status !== "pending" ? employee.managerId : null,
      reviewedAt: status !== "pending" ? new Date() : null,
    });
  }

  await db.insert(schema.timeOffRequests).values(requests);

  console.log("Creating task templates...");
  const onboardingTemplates = await db
    .insert(schema.taskTemplates)
    .values([
      {
        name: "Create and Review New Hire Training Plan",
        taskType: "onboarding",
        assignedToRole: "manager",
        dueDaysFromStart: 0,
        orderIndex: 1,
      },
      {
        name: "Meet & Greet",
        taskType: "onboarding",
        assignedToRole: "manager",
        dueDaysFromStart: 1,
        orderIndex: 2,
      },
      {
        name: "Laptop and Equipment Setup",
        taskType: "onboarding",
        assignedToRole: "it",
        dueDaysFromStart: -1,
        orderIndex: 3,
      },
      {
        name: "Google Workspace Access",
        taskType: "onboarding",
        assignedToRole: "it",
        dueDaysFromStart: -1,
        orderIndex: 4,
      },
      {
        name: "Complete Employment Paperwork",
        taskType: "onboarding",
        assignedToRole: "employee",
        dueDaysFromStart: 1,
        orderIndex: 5,
      },
      {
        name: "Benefits Enrollment",
        taskType: "onboarding",
        assignedToRole: "employee",
        dueDaysFromStart: 7,
        orderIndex: 6,
      },
      {
        name: "Review Company Policies",
        taskType: "onboarding",
        assignedToRole: "employee",
        dueDaysFromStart: 3,
        orderIndex: 7,
      },
    ])
    .returning();

  const offboardingTemplates = await db
    .insert(schema.taskTemplates)
    .values([
      {
        name: "Exit Interview",
        taskType: "offboarding",
        assignedToRole: "hr",
        dueDaysFromStart: 0,
        orderIndex: 1,
      },
      {
        name: "Collect Company Assets",
        taskType: "offboarding",
        assignedToRole: "it",
        dueDaysFromStart: 0,
        orderIndex: 2,
      },
      {
        name: "Disable System Access",
        taskType: "offboarding",
        assignedToRole: "it",
        dueDaysFromStart: 0,
        orderIndex: 3,
      },
      {
        name: "Knowledge Transfer",
        taskType: "offboarding",
        assignedToRole: "manager",
        dueDaysFromStart: -5,
        orderIndex: 4,
      },
      {
        name: "Final Payroll Processing",
        taskType: "offboarding",
        assignedToRole: "hr",
        dueDaysFromStart: 7,
        orderIndex: 5,
      },
    ])
    .returning();

  console.log("Creating sample onboarding tasks...");
  const newHires = allEmployees.slice(0, 5);
  const taskData = [];
  for (const newHire of newHires) {
    for (const template of onboardingTemplates) {
      const hireDate = new Date(newHire.hireDate!);
      const dueDate = new Date(hireDate);
      dueDate.setDate(dueDate.getDate() + (template.dueDaysFromStart || 0));

      taskData.push({
        employeeId: newHire.id,
        templateId: template.id,
        taskType: "onboarding",
        title: template.name!,
        description: template.description,
        assignedToId: template.assignedToRole === "manager" ? newHire.managerId : null,
        status: (Math.random() > 0.6 ? "completed" : "pending") as "completed" | "pending",
        dueDate: dueDate.toISOString().split("T")[0],
      });
    }
  }

  await db.insert(schema.employeeTasks).values(taskData);

  console.log("Creating compensation history...");
  const compData = [];
  for (const employee of [ceo, ...executives, ...allEmployees.slice(0, 30)]) {
    compData.push({
      employeeId: employee.id,
      effectiveDate: employee.hireDate!,
      payRate:
        employee.id === ceo.id
          ? "250000"
          : employee.jobLevelId === levels.find((l) => l.code === "M6")!.id
            ? "180000"
            : employee.jobLevelId === levels.find((l) => l.code === "M4")!.id
              ? "140000"
              : employee.jobLevelId === levels.find((l) => l.code === "M3")!.id
                ? "120000"
                : employee.jobLevelId === levels.find((l) => l.code === "IC4")!.id
                  ? "110000"
                  : employee.jobLevelId === levels.find((l) => l.code === "IC3")!.id
                    ? "95000"
                    : "75000",
      payType: "Salary",
      paySchedule: "Semi-Monthly",
      currency: employee.locationId === chennai.id ? "INR" : "CAD",
      changeReason: "New Employee",
    });
  }

  await db.insert(schema.compensationHistory).values(compData);

  console.log("Creating emergency contacts...");
  const emergencyData = [];
  for (const employee of [ceo, ...executives, ...allEmployees.slice(0, 20)]) {
    emergencyData.push({
      employeeId: employee.id,
      name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${employee.lastName}`,
      relationship: "Spouse",
      phone: "+1-306-555-9999",
      email: `emergency.${employee.firstName?.toLowerCase()}@example.com`,
      isPrimary: true,
    });
  }

  await db.insert(schema.emergencyContacts).values(emergencyData);

  console.log("Creating employee teams...");
  const teamData = [];
  for (let i = 0; i < Math.min(30, allEmployees.length); i++) {
    const employee = allEmployees[i];
    const team = i < 10 ? phoenixTeam : i < 20 ? seoTeam : i < 25 ? supportTeam : sreTeam;
    teamData.push({
      employeeId: employee.id,
      teamId: team.id,
    });
  }

  await db.insert(schema.employeeTeams).values(teamData);

  console.log("✅ Seeding completed!");
  console.log(`Created ${allEmployees.length + executives.length + 1} employees`);
  console.log(`Created ${policies.length} time off policies`);
  console.log(`Created ${balances.length} time off balances`);
  console.log(`Created ${requests.length} time off requests`);
  console.log(`Created ${taskData.length} onboarding tasks`);
}

seed()
  .catch((e) => {
    console.error("❌ Seeding failed");
    console.error(e);
    process.exit(1);
  })
  .then(() => {
    console.log("Seed complete");
    process.exit(0);
  });
