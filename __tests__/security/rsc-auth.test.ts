/**
 * Security test: Verify that RSC (React Server Component) payloads
 * do not leak protected employee data for unauthenticated requests
 */

import { describe, it, expect } from "@jest/globals";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

describe("RSC Authentication Security", () => {
  const protectedRoutes = [
    "/people",
    "/people/1",
    "/org-chart",
    "/seats",
    "/time-off",
    "/time-off/approvals",
    "/tasks",
    "/admin",
  ];

  const sensitivePatterns = [
    /@vendasta\.com/i,
    /[A-Z][a-z]+ [A-Z][a-z]+/, // Name patterns like "John Smith"
    /\bemployee\b/i,
    /\bemail\b/i,
    /\bphone\b/i,
    /\bsin\b/i,
    /\bssn\b/i,
  ];

  describe("Unauthenticated requests", () => {
    for (const route of protectedRoutes) {
      it(`should not leak employee data in RSC payload for ${route}`, async () => {
        // Make request without auth cookies, with RSC header
        const response = await fetch(`${BASE_URL}${route}`, {
          headers: {
            RSC: "1",
            "Next-Router-State-Tree": "%5B%22%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D",
          },
          redirect: "manual", // Don't follow redirects
        });

        // The response may be a redirect (which is fine)
        // or may return 200 with RSC payload (which should not contain sensitive data)
        
        if (response.status === 200) {
          const body = await response.text();
          
          // Check that response doesn't contain employee names or emails
          const hasEmployeeNames = body.match(/brendan|king|jean|parchewsky|david|chen|sarah|martinez|raj|patel/i);
          const hasVendastaEmails = body.includes("@vendasta.com");
          
          expect(hasEmployeeNames).toBeFalsy();
          expect(hasVendastaEmails).toBeFalsy();
          
          // Check for other sensitive patterns
          for (const pattern of sensitivePatterns) {
            const matches = body.match(pattern);
            if (matches) {
              console.warn(`Found potentially sensitive data in ${route}: ${matches[0]}`);
            }
          }
        } else {
          // If it's a redirect or other status, that's acceptable
          expect([301, 302, 307, 308, 401, 403]).toContain(response.status);
        }
      });

      it(`should not leak employee data in regular HTML for ${route}`, async () => {
        const response = await fetch(`${BASE_URL}${route}`, {
          redirect: "manual",
        });

        if (response.status === 200) {
          const body = await response.text();
          
          // Should not contain specific employee details in HTML
          const hasEmployeeNames = body.match(/brendan.*king|jean.*parchewsky/i);
          const hasVendastaEmails = body.includes("@vendasta.com");
          
          expect(hasEmployeeNames).toBeFalsy();
          expect(hasVendastaEmails).toBeFalsy();
        } else {
          // Redirect is expected and acceptable
          expect([301, 302, 307, 308]).toContain(response.status);
        }
      });
    }
  });

  describe("Sensitive field protection", () => {
    it("should not expose SIN/SSN in any response", async () => {
      const routes = ["/people/1", "/people"];
      
      for (const route of routes) {
        const response = await fetch(`${BASE_URL}${route}`, {
          headers: { RSC: "1" },
          redirect: "manual",
        });

        if (response.status === 200) {
          const body = await response.text();
          
          // Check that response doesn't contain SIN/SSN field names or values
          expect(body).not.toMatch(/\bsin["':\s]/i);
          expect(body).not.toMatch(/\bssn["':\s]/i);
          expect(body).not.toMatch(/\d{3}-\d{2}-\d{4}/); // SSN pattern
          expect(body).not.toMatch(/\d{3}\s?\d{3}\s?\d{3}/); // SIN pattern
        }
      }
    });
  });
});
