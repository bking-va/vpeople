import { BambooHrClient } from "@/lib/bamboo-sync/client";
import { runBambooFilesSync } from "@/lib/bamboo-sync/files-sync";
import {
  filesFromViewPayload,
  isRestrictedBambooFileCategory,
  mapDocumentCategory,
} from "@/lib/bamboo-sync/map-files";
import { canViewCompanyFile, canViewEmployeeDocument } from "@/lib/document-access";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Bamboo file category mapping", () => {
  test("marks I-9, immigration, commissions, and compensation letters restricted", () => {
    expect(isRestrictedBambooFileCategory("I-9")).toBe(true);
    expect(isRestrictedBambooFileCategory("Immigration")).toBe(true);
    expect(isRestrictedBambooFileCategory("Signed Documents")).toBe(true);
    expect(isRestrictedBambooFileCategory("Commission Docs")).toBe(true);
    expect(isRestrictedBambooFileCategory("Stock Option agreements")).toBe(true);
    expect(isRestrictedBambooFileCategory("Sunlife")).toBe(true);
    expect(isRestrictedBambooFileCategory("Resumes")).toBe(true);
    expect(isRestrictedBambooFileCategory("India Team")).toBe(true);
    expect(isRestrictedBambooFileCategory("compensation letters")).toBe(true);
    expect(isRestrictedBambooFileCategory("Employee Handbook")).toBe(false);
    expect(mapDocumentCategory("Sunlife")).toBe("benefits");
  });

  test("parses files/view categories without logging names", () => {
    const mapped = filesFromViewPayload(
      {
        categories: [
          {
            name: "I-9",
            files: [{ id: 12, name: "i9.pdf" }],
          },
        ],
      },
      "employee",
      "404"
    );
    expect(mapped).toHaveLength(1);
    expect(mapped[0].bambooId).toBe("emp:404:12");
    expect(mapped[0].restricted).toBe(true);
  });
});

describe("document access", () => {
  test("restricted employee files are HR or owner only, never other employees", () => {
    const doc = { employeeId: 2, restricted: true, containsCompensation: false };
    expect(
      canViewEmployeeDocument({
        viewerId: 2,
        accessLevel: "employee",
        document: doc,
      })
    ).toBe(true);
    expect(
      canViewEmployeeDocument({
        viewerId: 3,
        accessLevel: "manager",
        document: doc,
      })
    ).toBe(false);
    expect(
      canViewEmployeeDocument({
        viewerId: 1,
        accessLevel: "full_admin",
        canManageUsers: true,
        document: doc,
      })
    ).toBe(true);
  });

  test("restricted company files are HR only", () => {
    expect(
      canViewCompanyFile({
        accessLevel: "employee",
        file: { restricted: true, containsCompensation: false },
      })
    ).toBe(false);
    expect(
      canViewCompanyFile({
        accessLevel: "full_admin",
        canManageUsers: true,
        file: { restricted: true, containsCompensation: true },
      })
    ).toBe(true);
  });
});

describe("runBambooFilesSync", () => {
  test("imports employee and company files into private blobs without email", async () => {
    const store = {
      emailsSent: 0,
      employees: [
        {
          id: 7,
          bambooId: "404",
          email: "pat@vendasta.com",
          employeeNumber: "E7",
          firstName: "Pat",
          lastName: "Lee",
          accessLevel: "employee" as const,
          vendastaSub: null,
          userId: null,
          managerId: null,
        },
      ],
      documents: [] as Array<Record<string, unknown>>,
      company: [] as Array<Record<string, unknown>>,
      syncRuns: [] as Array<Record<string, unknown>>,
      async listEmployees() {
        return this.employees;
      },
      async lastIncompleteKindCheckpoint() {
        return null;
      },
      async startSyncRun(run: Record<string, unknown>) {
        this.syncRuns.push({ ...run, id: 1 });
        return 1;
      },
      async updateSyncRun(_id: number, run: Record<string, unknown>) {
        Object.assign(this.syncRuns[0], run);
      },
      async listImportedFileBambooIds() {
        return new Set<string>();
      },
      async upsertEmployeeDocumentsBatch(rows: Array<Record<string, unknown>>) {
        this.documents.push(...rows);
        return rows.length;
      },
      async upsertCompanyFilesBatch(rows: Array<Record<string, unknown>>) {
        this.company.push(...rows);
        return rows.length;
      },
    };

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/employees/404/files/view")) {
        return jsonResponse({
          categories: [{ name: "I-9", files: [{ id: 12, name: "i9.pdf" }] }],
        });
      }
      if (url.endsWith("/employees/404/files/12")) {
        return new Response(Buffer.from("i9"), {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        });
      }
      if (url.endsWith("/files/view")) {
        return jsonResponse({
          categories: [
            { name: "Policies", files: [{ id: 88, name: "handbook.pdf" }] },
          ],
        });
      }
      if (url.endsWith("/files/88")) {
        return new Response(Buffer.from("hb"), { status: 200 });
      }
      return jsonResponse({ error: url }, 404);
    };

    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: fetchImpl,
    });
    const blobs: string[] = [];
    const result = await runBambooFilesSync({
      client,
      store: store as never,
      blob: {
        async putPrivate(input) {
          blobs.push(input.pathname);
          return { url: `https://blob.vercel-storage.com/${input.pathname}` };
        },
      },
      mode: "full",
      log: () => undefined,
    });
    expect(result.status).toBe("success");
    expect(store.documents).toHaveLength(1);
    expect(store.documents[0].restricted).toBe(true);
    expect(store.company).toHaveLength(1);
    expect(blobs.every((path) => path.startsWith("bamboo-files/"))).toBe(true);
    expect(JSON.stringify(store.syncRuns)).not.toMatch(/pat@vendasta/i);
  });
});
