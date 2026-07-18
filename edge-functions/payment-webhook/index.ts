// Called by Rapid Gateway after a payment completes. No user JWT — deploy with --no-verify-jwt
// and rely on the HMAC signature check below instead.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RG_WEBHOOK_SECRET = Deno.env.get("RG_WEBHOOK_SECRET") ?? "";
const RENEWAL_PERIOD_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!RG_WEBHOOK_SECRET) {
    console.error("RG_WEBHOOK_SECRET is not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("X-RG-Signature") ?? "";

  if (!(await verifySignature(rawBody, signature, RG_WEBHOOK_SECRET))) {
    console.warn("Rejected webhook: bad or missing signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // TODO: confirm these field names against Rapid Gateway's live webhook payload shape.
  const status = payload.status ?? payload.event;
  const shopId = payload.metadata?.shop_id;
  const reference = payload.reference ?? payload.id;

  if (status !== "succeeded" && status !== "payment.succeeded") {
    // Failed/pending/other events — acknowledge so the gateway doesn't retry, but do nothing.
    return new Response("OK", { status: 200 });
  }
  if (!shopId) {
    console.error("Webhook missing shop_id in metadata", payload);
    return new Response("Missing shop_id", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await supabase.rpc("record_payment_success", {
    p_shop_id: shopId,
    p_provider: "rapidgateway",
    p_reference: reference,
    p_period_days: RENEWAL_PERIOD_DAYS,
  });

  if (error) {
    console.error("record_payment_success failed:", error);
    return new Response("Database update failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
});

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
