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

## Notes

- Cost price is only ever queried by Owners against the `inventory` table.
  Salesman screens query `inventory_salesman_view`, which excludes it — but
  the real enforcement is the RLS policy on the base table, not the UI.
- All stock changes go through the `adjust_stock` RPC so concurrent sales
  can't oversell or produce lost updates.
- No admin/service-role key is ever used in this frontend — account
  creation works entirely through self-signup + developer/owner "claim"
  actions, which is what `002_frontend_support.sql` sets up.
