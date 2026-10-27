import crypto from "crypto";
import { prisma } from "@/lib/prisma";

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export async function deliverWebhook(webhookId: string, event: string, data: Record<string, unknown>) {
  try {
    const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook || !webhook.active) return;
    if (!webhook.events.includes(event) && !webhook.events.includes("*")) return;

    const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Veritas-Engine-Webhook/1.0",
      "X-Veritas-Event": event,
    };
    if (webhook.secret) {
      headers["X-Veritas-Signature"] = `sha256=${sign(payload, webhook.secret)}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: payload,
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);
    return res?.ok;
  } catch (e) {
    console.error("webhook deliver error", e);
  }
}
