/**
 * Webhook Delivery Tests
 * 
 * Tests webhook delivery with:
 * - HMAC signature verification
 * - Retry logic with exponential backoff
 * - 4xx errors (no retry)
 * - 5xx errors (with retry)
 * - Event filtering
 */

import { deliverWebhook, broadcastWebhookEvent } from "@/lib/webhooks";
import { db } from "@/lib/db";
import { webhooks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

// Mock fetch globally
global.fetch = jest.fn();

// Mock database
jest.mock("@/lib/db", () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  },
}));

describe("Webhook Delivery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("HMAC Signature", () => {
    test("generates correct HMAC signature for payload", async () => {
      const secret = "test-secret-key";
      const payload = {
        event: "employee.created",
        data: { id: 1, name: "John Doe" },
        timestamp: "2026-11-08T16:00:00Z",
      };

      // Mock webhook
      (db.select().from(webhooks).where as jest.Mock).mockResolvedValueOnce([
        {
          id: 1,
          name: "Test Webhook",
          url: "https://example.com/webhook",
          events: JSON.stringify(["employee.created"]),
          secret,
          isActive: true,
        },
      ]);

      // Mock successful fetch
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const result = await deliverWebhook(1, payload);

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        "https://example.com/webhook",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Bamboo-Signature": expect.any(String),
            "X-Bamboo-Event": "employee.created",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(payload),
        })
      );

      // Verify signature is correct
      const call = (fetch as jest.Mock).mock.calls[0];
      const sentSignature = call[1].headers["X-Bamboo-Signature"];
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(JSON.stringify(payload))
        .digest("hex");

      expect(sentSignature).toBe(expectedSignature);
    });
  });

  describe("Retry Logic", () => {
    test("retries on 5xx errors with exponential backoff", async () => {
      const secret = "test-secret";
      const payload = {
        event: "employee.updated",
        data: { id: 1 },
        timestamp: "2026-11-08T16:00:00Z",
      };

      (db.select().from(webhooks).where as jest.Mock).mockResolvedValueOnce([
        {
          id: 1,
          name: "Test",
          url: "https://example.com/webhook",
          events: JSON.stringify(["employee.updated"]),
          secret,
          isActive: true,
        },
      ]);

      // Mock 3 failures then success
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" })
        .mockResolvedValueOnce({ ok: false, status: 502, statusText: "Bad Gateway" })
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK" });

      const startTime = Date.now();
      const result = await deliverWebhook(1, payload, 3);
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.attemptNumber).toBe(3);
      expect(fetch).toHaveBeenCalledTimes(3);
      
      // Verify backoff timing (1s + 2s = ~3s minimum)
      expect(elapsed).toBeGreaterThanOrEqual(2900);
    });

    test("does NOT retry on 4xx client errors", async () => {
      (db.select().from(webhooks).where as jest.Mock).mockResolvedValueOnce([
        {
          id: 1,
          name: "Test",
          url: "https://example.com/webhook",
          events: JSON.stringify(["employee.created"]),
          secret: "secret",
          isActive: true,
        },
      ]);

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      });

      const result = await deliverWebhook(
        1,
        {
          event: "employee.created",
          data: {},
          timestamp: "2026-11-08T16:00:00Z",
        },
        3
      );

      expect(result.success).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1); // No retries on 4xx
    });

    test("gives up after max retries", async () => {
      (db.select().from(webhooks).where as jest.Mock).mockResolvedValueOnce([
        {
          id: 1,
          name: "Test",
          url: "https://example.com/webhook",
          events: JSON.stringify(["employee.created"]),
          secret: "secret",
          isActive: true,
        },
      ]);

      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await deliverWebhook(
        1,
        {
          event: "employee.created",
          data: {},
          timestamp: "2026-11-08T16:00:00Z",
        },
        3
      );

      expect(result.success).toBe(false);
      expect(result.attemptNumber).toBe(3);
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("Event Filtering", () => {
    test("does not deliver events webhook is not subscribed to", async () => {
      (db.select().from(webhooks).where as jest.Mock).mockResolvedValueOnce([
        {
          id: 1,
          name: "Test",
          url: "https://example.com/webhook",
          events: JSON.stringify(["employee.created"]), // Only subscribed to created
          secret: "secret",
          isActive: true,
        },
      ]);

      const result = await deliverWebhook(1, {
        event: "employee.updated", // Sending updated event
        data: {},
        timestamp: "2026-11-08T16:00:00Z",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Event not subscribed");
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("Broadcast", () => {
    test("delivers to all active webhooks subscribed to event", async () => {
      (db.select().from(webhooks).where as jest.Mock).mockResolvedValueOnce([
        {
          id: 1,
          name: "Webhook 1",
          url: "https://example1.com/webhook",
          events: JSON.stringify(["employee.created", "employee.updated"]),
          secret: "secret1",
          isActive: true,
        },
        {
          id: 2,
          name: "Webhook 2",
          url: "https://example2.com/webhook",
          events: JSON.stringify(["employee.created"]),
          secret: "secret2",
          isActive: true,
        },
        {
          id: 3,
          name: "Webhook 3 (inactive)",
          url: "https://example3.com/webhook",
          events: JSON.stringify(["employee.created"]),
          secret: "secret3",
          isActive: false, // Inactive - should not receive
        },
      ]);

      // Mock individual deliveries
      (db.select().from(webhooks).where as jest.Mock)
        .mockResolvedValueOnce([
          {
            id: 1,
            events: JSON.stringify(["employee.created", "employee.updated"]),
            url: "https://example1.com/webhook",
            secret: "secret1",
            isActive: true,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 2,
            events: JSON.stringify(["employee.created"]),
            url: "https://example2.com/webhook",
            secret: "secret2",
            isActive: true,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 3,
            events: JSON.stringify(["employee.created"]),
            url: "https://example3.com/webhook",
            secret: "secret3",
            isActive: false,
          },
        ]);

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const results = await broadcastWebhookEvent("employee.created", { id: 1 });

      expect(results).toHaveLength(3); // All 3 webhooks attempted
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(false); // Inactive
    });
  });

  describe("Error Handling", () => {
    test("handles network errors gracefully", async () => {
      (db.select().from(webhooks).where as jest.Mock).mockResolvedValueOnce([
        {
          id: 1,
          name: "Test",
          url: "https://example.com/webhook",
          events: JSON.stringify(["employee.created"]),
          secret: "secret",
          isActive: true,
        },
      ]);

      (fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      const result = await deliverWebhook(1, {
        event: "employee.created",
        data: {},
        timestamp: "2026-11-08T16:00:00Z",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });
});
