import { scoreCandidatesWithClaude, summarizeResumeWithClaude } from "@/lib/matching/anthropic";
import { lexicalScore, tokenize } from "@/lib/matching/lexical";
import { parseCustomerLocationCsv } from "@/lib/matching/csv-import";
import { MIN_ROLE_QUERY_LENGTH, normalizeRoleQuery, parseMatchFilters } from "@/lib/matching/filters";
import { extractDocxText, extractPdfStringsFallback, hashResumeBytes } from "@/lib/matching/resume-text";

describe("lexical shortlist", () => {
  test("ranks a typescript engineer above an unrelated sales bio", () => {
    const query = "Senior TypeScript engineer Postgres Next.js";
    const engineer = lexicalScore(query, "Staff engineer TypeScript Postgres Next.js SaaS");
    const sales = lexicalScore(query, "Account executive quota enterprise deals");
    expect(engineer).toBeGreaterThan(sales);
    expect(tokenize(query)).toContain("typescript");
  });
});

describe("filters and CSV", () => {
  test("clamps proximity settings", () => {
    const parsed = parseMatchFilters({
      locationRequirement: "near_customers",
      maxDistanceKm: 999999,
      locationWeight: -4,
    });
    expect(parsed.locationRequirement).toBe("near_customers");
    expect(parsed.maxDistanceKm).toBe(20_000);
    expect(parsed.locationWeight).toBe(0);
  });

  test("rejects short role descriptions before any search work", () => {
    expect(normalizeRoleQuery("   hi  ").length).toBeLessThan(MIN_ROLE_QUERY_LENGTH);
    expect(normalizeRoleQuery("Senior TypeScript engineer for a product team").length).toBeGreaterThan(
      MIN_ROLE_QUERY_LENGTH
    );
  });

  test("parses customer location CSV and ignores street-free formula cells", () => {
    const rows = parseCustomerLocationCsv(
      "label,city,province,country,postal_code\nAcme West,Calgary,Alberta,Canada,T2P 1J9\n=CMD,Banff,Alberta,Canada,T1L"
    );
    expect(rows[0]).toMatchObject({ label: "Acme West", city: "Calgary", country: "Canada" });
    expect(rows[1].label.startsWith("'")).toBe(true);
  });
});

describe("Anthropic structured scoring", () => {
  test("parses tool JSON and ignores unknown keys plus protected wording in reasons", () => {
    return scoreCandidatesWithClaude({
      roleQuery: "TypeScript engineer",
      candidates: [{ key: "employee:1", facts: ["Current title: Staff Engineer"] }],
      model: "claude-sonnet-4-5",
      apiKey: "test-key",
      maxOutputTokens: 512,
      maxInputTokens: 4000,
      transport: async ({ apiKey, body }) => {
        expect(apiKey).toBe("test-key");
        expect(JSON.stringify(body)).not.toMatch(/ANTHROPIC_API_KEY/);
        return {
          content: [
            {
              type: "tool_use",
              name: "submit_match_scores",
              input: {
                scores: [
                  {
                    candidateKey: "employee:1",
                    score: 91,
                    reasons: ["Current title: Staff Engineer", "Gender: skip this"],
                  },
                  { candidateKey: "employee:999", score: 5, reasons: ["injected"] },
                ],
              },
            },
          ],
          usage: { input_tokens: 100, output_tokens: 20 },
        };
      },
    }).then((result) => {
      expect(result.scores).toHaveLength(1);
      expect(result.scores[0].score).toBe(91);
      expect(result.scores[0].reasons.join(" ")).not.toMatch(/Gender/i);
      expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 20 });
    });
  });

  test("résumé summarizer never asks the model for street or DOB", async () => {
    const result = await summarizeResumeWithClaude({
      strippedResumeText: "Ada Lovelace. TypeScript. 123 Main Street. DOB 1815.",
      model: "claude-sonnet-4-5",
      apiKey: "test-key",
      maxOutputTokens: 512,
      transport: async ({ body }) => {
        const payload = JSON.stringify(body);
        expect(payload).not.toMatch(/123 Main Street/);
        expect(payload.toLowerCase()).not.toContain("1815");
        return {
          content: [
            {
              type: "tool_use",
              name: "submit_resume_summary",
              input: {
                skills: ["TypeScript"],
                titles: ["Analyst"],
                education: [],
                summary: "TypeScript analyst.",
                location: { city: "Saskatoon", province: "SK", country: "Canada", postalCode: null },
              },
            },
          ],
          usage: { input_tokens: 40, output_tokens: 12 },
        };
      },
    });
    expect(result.summary.skills).toEqual(["TypeScript"]);
    expect(result.summary.location?.city).toBe("Saskatoon");
  });
});

describe("resume bytes", () => {
  test("hashes résumé bytes without logging them", () => {
    const hash = hashResumeBytes(Buffer.from("resume-bytes"));
    expect(hash).toHaveLength(64);
  });

  test("extracts DOCX document.xml text", () => {
    const xml = Buffer.from(
      '<?xml version="1.0"?><w:document><w:p><w:t>Hello TypeScript</w:t></w:p></w:document>'
    );
    // Round-trip through zip using fflate's unzipSync inverse: build a fake zip via unzipSync input.
    const { zipSync } = jest.requireActual("fflate") as typeof import("fflate");
    const bytes = zipSync({ "word/document.xml": xml });
    expect(extractDocxText(bytes)).toContain("Hello TypeScript");
  });

  test("PDF fallback reads literal strings", () => {
    const pdf = Buffer.from("%PDF-1.1\n(BT (Ada Lovelace TypeScript) Tj) ET", "latin1");
    expect(extractPdfStringsFallback(pdf)).toContain("TypeScript");
  });
});
