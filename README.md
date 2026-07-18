# Ledger — Shop Inventory Frontend

Plain HTML/CSS/JS single-page app. No build step, so it deploys straight to
GitHub Pages. Talks to Supabase via `@supabase/supabase-js` loaded from a CDN.

## 1. Configure

Edit `js/config.js` and paste your Supabase project's URL and anon public key
(Project Settings → API in the Supabase dashboard).

## 2. Run locally

Any static file server works, e.g.:

```
npx serve .
```

or Python:

```
python3 -m http.server 8000
```

Open the printed localhost URL. Do **not** just double-click `index.html` —
ES module imports require it to be served over http(s), not `file://`.

## 3. Deploy to GitHub Pages

```
git init
git add .
git commit -m "Ledger frontend"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source → Deploy from a branch →
`main` / `root`**. Your app will be live at
`https://YOUR-USERNAME.github.io/YOUR-REPO/`.

## 4. First-time account setup

1. Add your own user in Supabase Dashboard → Authentication → Users, or sign
   up through the app itself.
2. Promote yourself to `developer` via the SQL Editor (see the schema.sql
   comments / earlier setup instructions).
3. Sign in on the app — you'll land on the Developer dashboard.
4. Have your first Shop Owner create an account through the app's "Create
   account" tab, then promote them from the Developer → "Unassigned users"
   screen (this also creates their shop and sets its tier).
5. Have salesmen create accounts the same way; the Owner adds them from the
   Staff screen (limited to 3 on Free, 10 on Paid — enforced both in the UI
   and by a database trigger).

## Billing / payments

Every shop starts on a **7-day trial**, then needs a **Rs. 500/month**
renewal. There is no true auto-recurring subscription — the Owner clicks
**Renew** and pays a one-off charge that extends their access 30 days.
Card/wallet details are entered on the gateway's own hosted checkout page
and never touch this app.

**Gateway: Rapid Gateway** (rapidgateway.pk) — chosen because it bundles
JazzCash + Easypaisa + cards behind one merchant account and one API, so
you don't need separate agreements with each wallet. Published pricing is
a flat 2% MDR on wallet payments, no setup fee, T+1 settlement to your
bank, and same-day sandbox keys.

### Setup steps

1. Call **+92 315 4020909** or go to rapidgateway.pk/contact — a 15-minute
   KYC call. As a sole proprietor you'll need your **CNIC** and **bank
   account details**; a registered company needs NTN + incorporation
   certificate instead.
2. Sandbox credentials arrive the same day, before KYC is even fully
   verified — you can build against them immediately.
3. Test with their sandbox phone numbers: `+92 300 0000001` always
   succeeds, `+92 300 0000002` always fails (use it to test your error
   handling).
4. Once KYC clears (usually within the hour), swap sandbox keys for live
   keys — no code changes needed.

### Deploying the two Edge Functions (in `../edge-functions/`)

- **`create-payment`** — called when the Owner clicks Renew. Creates a
  Rapid Gateway payment intent and returns a hosted checkout URL.
- **`payment-webhook`** — called by Rapid Gateway after payment.
  Verifies the `X-RG-Signature` HMAC, then extends the shop's paid period
  via the `record_payment_success` database function.

```
supabase functions deploy create-payment
supabase functions deploy payment-webhook --no-verify-jwt
supabase secrets set RG_SECRET_KEY=... RG_WEBHOOK_SECRET=...
```

Before deploying, edit the placeholder URLs at the top of
`create-payment/index.ts` (`FRONTEND_RETURN_URL`, `WEBHOOK_URL`) to your
real GitHub Pages URL and Supabase project ref.

Run `003_billing.sql` (after `schema.sql` and `002_frontend_support.sql`)
to add trial tracking and the billing gate before deploying any of this.

**Note on field names**: the request/response shape in both functions
follows Rapid Gateway's public developer guide as of mid-2026. Cross-check
it against the actual API reference that ships with your sandbox kit —
docs pages can drift slightly from the live spec — before switching to
production traffic.

## Notes

- Cost price is only ever queried by Owners against the `inventory` table.
  Salesman screens query `inventory_salesman_view`, which excludes it — but
  the real enforcement is the RLS policy on the base table, not the UI.
- All stock changes go through the `adjust_stock` RPC so concurrent sales
  can't oversell or produce lost updates.
- No admin/service-role key is ever used in this frontend — account
  creation works entirely through self-signup + developer/owner "claim"
  actions, which is what `002_frontend_support.sql` sets up.
