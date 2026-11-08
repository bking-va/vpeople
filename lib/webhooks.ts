import crypto from "crypto";
import { db } from "@/lib/db";
import { webhooks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface WebhookPayload {
  event: string;
  data: any;
  timestamp: string;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  attemptNumber: number;
}

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}

/**
 * Deliver webhook with retries and exponential backoff
 */
export async function deliverWebhook(
  webhookId: number,
  payload: WebhookPayload,
  maxRetries: number = 3
): Promise<WebhookDeliveryResult> {
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, webhookId))
    .limit(1);

  if (!webhook || !webhook.isActive) {
    return {
      success: false,
      error: "Webhook not found or inactive",
      attemptNumber: 0,
    };
  }

  // Check if this event is subscribed
  const subscribedEvents = JSON.parse(webhook.events);
  if (!subscribedEvents.includes(payload.event)) {
    return {
      success: false,
      error: "Event not subscribed",
      attemptNumber: 0,
    };
  }

  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString, webhook.secret);

  let lastError: string | undefined;
  let lastStatusCode: number | undefined;

  // Retry with exponential backoff
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bamboo-Signature": signature,
          "X-Bamboo-Event": payload.event,
          "X-Bamboo-Delivery-ID": crypto.randomUUID(),
          "User-Agent": "vPeople-Webhooks/1.0",
        },
        body: payloadString,
      });

      lastStatusCode = response.status;

      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          attemptNumber: attempt,
        };
      }

      lastError = `HTTP ${response.status}: ${response.statusText}`;

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        break;
      }
    } catch (error: any) {
      lastError = error.message;
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  return {
    success: false,
    statusCode: lastStatusCode,
    error: lastError,
    attemptNumber: maxRetries,
  };
}

/**
 * Broadcast webhook event to all subscribed webhooks
 */
export async function broadcastWebhookEvent(
  event: string,
  data: any
): Promise<WebhookDeliveryResult[]> {
  const allWebhooks = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.isActive, true));

  const payload: WebhookPayload = {
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  const results = await Promise.all(
    allWebhooks.map(webhook => deliverWebhook(webhook.id, payload))
  );

  return results;
}
