// Called from the Owner's browser via supabase.functions.invoke("create-payment", { body: { shop_id } })
// Creates a Rapid Gateway payment intent and returns a hosted checkout URL.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// TODO: set these to your real GitHub Pages URL and this project's function URL before going live.
const FRONTEND_RETURN_URL = "https://YOUR-USERNAME.github.io/YOUR-REPO/";
const WEBHOOK_URL = "https://qqsbepqpkrpovfpyifzo.supabase.co/functions/v1/payment-webhook";

// TODO: confirm this base URL and the field names below against the API reference that
// ships with your Rapid Gateway sandbox kit — the README notes docs can drift from the live spec.
const RG_BASE_URL = "https://api.rapidgateway.pk/v1";
const RG_SECRET_KEY = Deno.env.get("RG_SECRET_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    if (!RG_SECRET_KEY) {
      return json({ error: "RG_SECRET_KEY is not configured on this function" }, 500);
    }

    // Verify the caller and read data as *them*, so RLS enforces "only the owner of this shop".
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const { shop_id } = await req.json().catch(() => ({}));
    if (!shop_id) return json({ error: "shop_id is required" }, 400);

    const { data: shop, error: shopErr } = await supabase
      .from("shops")
      .select("id, shop_name, owner_id, monthly_price_pkr")
      .eq("id", shop_id)
      .single();

    if (shopErr || !shop) return json({ error: "Shop not found or not accessible" }, 404);
    if (shop.owner_id !== user.id) return json({ error: "Only the shop owner can renew" }, 403);

    const amountPkr = Number(shop.monthly_price_pkr);
    const reference = `${shop.id}-${Date.now()}`;

    const rgResp = await fetch(`${RG_BASE_URL}/payment-intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RG_SECRET_KEY}`,
      },
      body: JSON.stringify({
        amount: Math.round(amountPkr * 100), // paisa
        currency: "PKR",
        reference,
        description: `Ledger renewal — ${shop.shop_name}`,
        return_url: FRONTEND_RETURN_URL,
        webhook_url: WEBHOOK_URL,
        metadata: { shop_id: shop.id },
      }),
    });

    if (!rgResp.ok) {
      console.error("Rapid Gateway error:", await rgResp.text());
      return json({ error: "Payment gateway rejected the request" }, 502);
    }

    const rgData = await rgResp.json();
    // TODO: confirm the actual response field for the hosted checkout URL against the live docs.
    const checkoutUrl = rgData.checkout_url ?? rgData.hosted_url ?? rgData.url;
    if (!checkoutUrl) {
      console.error("No checkout URL in Rapid Gateway response:", rgData);
      return json({ error: "Gateway did not return a checkout URL" }, 502);
    }

    return json({ checkout_url: checkoutUrl, reference });
  } catch (err) {
    console.error(err);
    return json({ error: "Unexpected server error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
