import { BambooHrClient } from "@/lib/bamboo-sync/client";
import { isStoredBlobUrl, storedBlobGetUrl, storedBlobPathname } from "@/lib/bamboo-sync/blob";
import { runBambooFilesSync } from "@/lib/bamboo-sync/files-sync";
import {
  filesFromViewPayload,
  isRestrictedBambooFileCategory,
  mapDocumentCategory,
} from "@/lib/bamboo-sync/map-files";
import { canViewCompanyFile, canViewEmployeeDocument } from "@/lib/document-access";

describe("stored blob URL guard", () => {
  test("accepts Vercel Blob hosts and rejects other https URLs", () => {
    expect(isStoredBlobUrl("https://blob.vercel-storage.com/private/i9")).toBe(true);
    expect(
      isStoredBlobUrl("https://store.blob.vercel-storage.com/ats-resumes/file.pdf")
    ).toBe(true);
    expect(
      isStoredBlobUrl("https://store.public.blob.vercel-storage.com/file.pdf")
    ).toBe(true);
    expect(isStoredBlobUrl("https://evil.example/steal")).toBe(false);
    expect(isStoredBlobUrl("https://evil.example.blob.vercel-storage.com.attacker/x")).toBe(
      false
    );
    expect(isStoredBlobUrl("https://user:pass@blob.vercel-storage.com/x")).toBe(false);
    expect(isStoredBlobUrl("http://blob.vercel-storage.com/x")).toBe(false);
    expect(isStoredBlobUrl("bamboo:unavailable")).toBe(false);
    expect(isStoredBlobUrl(null)).toBe(false);
  });

  test("extracts a store pathname and rejects traversal", () => {
    expect(storedBlobPathname("https://blob.vercel-storage.com/private/i9")).toBe(
      "private/i9"
    );
    expect(
      storedBlobPathname("https://store.blob.vercel-storage.com/ats-resumes/file.pdf")
    ).toBe("ats-resumes/file.pdf");
    expect(storedBlobPathname("https://evil.example/steal")).toBe(null);
    expect(storedBlobPathname("https://blob.vercel-storage.com/")).toBe(null);
    expect(storedBlobPathname("bamboo:unavailable")).toBe(null);
    expect(
      storedBlobPathname("https://blob.vercel-storage.com/private/file%23q%3F.pdf")
    ).toBe("private/file%23q%3F.pdf");
    expect(
      storedBlobGetUrl("https://STORE.blob.vercel-storage.com/private/file%23q%3F.pdf")
    ).toBe("https://store.blob.vercel-storage.com/private/file%23q%3F.pdf");
    expect(storedBlobGetUrl("https://evil.example/steal")).toBe(null);
  });
});

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

  test("company files are HR-only unless Bamboo explicitly shares them", () => {
    const [unshared] = filesFromViewPayload(
      {
        categories: [
          {
            name: "Policies",
            files: [{ id: 88, name: "handbook.pdf", shareWithEmployees: "no" }],
          },
        ],
      },
      "company"
    );
    expect(unshared.restricted).toBe(true);

    const [unresolved] = filesFromViewPayload(
      {
        categories: [{ name: "Policies", files: [{ id: 89, name: "handbook.pdf" }] }],
      },
      "company"
    );
    expect(unresolved.restricted).toBe(true);

    const [shared] = filesFromViewPayload(
      {
        categories: [
          {
            name: "Policies",
            files: [{ id: 90, name: "handbook.pdf", shareWithEmployees: "yes" }],
          },
        ],
      },
      "company"
    );
    expect(shared.restricted).toBe(false);

    const [restrictedShared] = filesFromViewPayload(
      {
        categories: [
          {
            name: "Compensation Letters",
            files: [{ id: 91, name: "comp.pdf", shareWithEmployees: "yes" }],
          },
        ],
      },
      "company"
    );
    expect(restrictedShared.restricted).toBe(true);
    expect(restrictedShared.containsCompensation).toBe(true);
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

  test("shared non-restricted company files remain visible to employees", () => {
    expect(
      canViewCompanyFile({
        accessLevel: "employee",
        file: { restricted: false, containsCompensation: false },
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
      async listImportedFileBambooIds(kind: "employee" | "company") {
        const rows = kind === "company" ? this.company : this.documents;
        return new Set(
          rows
            .filter((row) => row.bambooId && row.fileUrl)
            .map((row) => String(row.bambooId))
        );
      },
      async upsertEmployeeDocumentsBatch(rows: Array<Record<string, unknown>>) {
        for (const row of rows) {
          const existing = this.documents.find((item) => item.bambooId === row.bambooId);
          if (existing) {
            const next = { ...row };
            if (next.fileUrl == null) next.fileUrl = existing.fileUrl;
            Object.assign(existing, next);
          } else this.documents.push(row);
        }
        return rows.length;
      },
      async upsertCompanyFilesBatch(rows: Array<Record<string, unknown>>) {
        for (const row of rows) {
          const existing = this.company.find((item) => item.bambooId === row.bambooId);
          if (existing) {
            const next = { ...row };
            if (next.fileUrl == null) next.fileUrl = existing.fileUrl;
            Object.assign(existing, next);
          } else this.company.push(row);
        }
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

  test("retries metadata-only rows once blob storage is available", async () => {
    const store = {
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
      documents: [
        {
          bambooId: "emp:404:12",
          employeeId: 7,
          title: "i9.pdf",
          fileUrl: null,
        },
      ] as Array<Record<string, unknown>>,
      company: [
        {
          bambooId: "company:88",
          title: "handbook.pdf",
          fileUrl: null,
        },
      ] as Array<Record<string, unknown>>,
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
      async listImportedFileBambooIds(kind: "employee" | "company") {
        const rows = kind === "company" ? this.company : this.documents;
        return new Set(
          rows
            .filter((row) => row.bambooId && row.fileUrl)
            .map((row) => String(row.bambooId))
        );
      },
      async upsertEmployeeDocumentsBatch(rows: Array<Record<string, unknown>>) {
        for (const row of rows) {
          const existing = this.documents.find((item) => item.bambooId === row.bambooId);
          if (existing) Object.assign(existing, row);
          else this.documents.push(row);
        }
        return rows.length;
      },
      async upsertCompanyFilesBatch(rows: Array<Record<string, unknown>>) {
        for (const row of rows) {
          const existing = this.company.find((item) => item.bambooId === row.bambooId);
          if (existing) Object.assign(existing, row);
          else this.company.push(row);
        }
        return rows.length;
      },
    };
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: async (input) => {
        const url = String(input);
        if (url.endsWith("/employees/404/files/view")) {
          return jsonResponse({
            categories: [{ name: "I-9", files: [{ id: 12, name: "i9.pdf" }] }],
          });
        }
        if (url.endsWith("/employees/404/files/12")) {
          return new Response(Buffer.from("i9"), { status: 200 });
        }
        if (url.endsWith("/files/view")) {
          return jsonResponse({
            categories: [{ name: "Policies", files: [{ id: 88, name: "handbook.pdf" }] }],
          });
        }
        if (url.endsWith("/files/88")) {
          return new Response(Buffer.from("hb"), { status: 200 });
        }
        return jsonResponse({ error: url }, 404);
      },
    });
    const result = await runBambooFilesSync({
      client,
      store: store as never,
      blob: {
        async putPrivate(input) {
          return { url: `https://blob.vercel-storage.com/${input.pathname}` };
        },
      },
      mode: "full",
      log: () => undefined,
    });
    expect(result.status).toBe("success");
    expect(String(store.documents[0].fileUrl)).toContain("blob.vercel-storage.com");
    expect(String(store.company[0].fileUrl)).toContain("blob.vercel-storage.com");
  });

  test("full resync updates company-file permissions without re-downloading blobs", async () => {
    const store = {
      employees: [] as Array<Record<string, unknown>>,
      documents: [] as Array<Record<string, unknown>>,
      company: [
        {
          bambooId: "company:88",
          title: "handbook.pdf",
          bambooCategory: "Policies",
          restricted: false,
          containsCompensation: false,
          fileUrl: "https://blob.vercel-storage.com/bamboo-files/company/existing",
        },
      ] as Array<Record<string, unknown>>,
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
      async listImportedFileBambooIds(kind: "employee" | "company") {
        const rows = kind === "company" ? this.company : this.documents;
        return new Set(
          rows
            .filter((row) => row.bambooId && row.fileUrl)
            .map((row) => String(row.bambooId))
        );
      },
      async upsertEmployeeDocumentsBatch() {
        return 0;
      },
      async upsertCompanyFilesBatch(rows: Array<Record<string, unknown>>) {
        for (const row of rows) {
          const existing = this.company.find((item) => item.bambooId === row.bambooId);
          if (existing) {
            const next = { ...row };
            if (next.fileUrl == null) next.fileUrl = existing.fileUrl;
            Object.assign(existing, next);
          } else this.company.push(row);
        }
        return rows.length;
      },
    };
    const downloaded: string[] = [];
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: async (input) => {
        const url = String(input);
        if (url.endsWith("/files/view")) {
          return jsonResponse({
            categories: [
              {
                name: "Compensation Letters",
                files: [{ id: 88, name: "handbook.pdf", shareWithEmployees: "no" }],
              },
            ],
          });
        }
        if (url.includes("/files/88")) {
          downloaded.push(url);
          return new Response(Buffer.from("hb"), { status: 200 });
        }
        return jsonResponse({ error: url }, 404);
      },
    });
    const result = await runBambooFilesSync({
      client,
      store: store as never,
      blob: {
        async putPrivate() {
          downloaded.push("put");
          return { url: "https://blob.vercel-storage.com/bamboo-files/company/new" };
        },
      },
      mode: "full",
      log: () => undefined,
    });
    expect(result.status).toBe("success");
    expect(downloaded).toEqual([]);
    expect(store.company[0].restricted).toBe(true);
    expect(store.company[0].containsCompensation).toBe(true);
    expect(store.company[0].bambooCategory).toBe("Compensation Letters");
    expect(store.company[0].fileUrl).toBe(
      "https://blob.vercel-storage.com/bamboo-files/company/existing"
    );
  });
});
