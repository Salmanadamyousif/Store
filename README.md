# AI-Powered Affiliate Store (with real database sync)

A store where products are pre-synced into a real database instead of
querying AliExpress live on every search — faster, more accurate, and
filters out accessories automatically.

## How it works now

```
Vercel Cron (daily)
      ↓
/api/sync → pulls products for a list of seed keywords from AliExpress
          → normalizes + flags accessories
          → saves into Supabase (Postgres)

User visits site / searches
   
      ↓
/api/trending or /api/search → reads from Supabase (fast, no live API call)
```

## 1. Set up Supabase (free database)

1. Go to supabase.com → create a free project
2. Go to **SQL Editor** → paste the contents of `sql/schema.sql` → Run
3. Go to **Project Settings → API** → copy:
   - `Project URL` → this is `SUPABASE_URL`
   - `service_role` key (not `anon`!) → this is `SUPABASE_SERVICE_ROLE_KEY`

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:
- `GEMINI_API_KEY` — aistudio.google.com/apikey
- `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_TRACKING_ID` — from your affiliate account
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from step 1
- `CRON_SECRET` — make up any long random string yourself

## 3. Run locally

```bash
npm install
npm run dev
```

The database will be empty at first. Trigger a manual sync:

```
http://localhost:3000/api/sync?secret=YOUR_CRON_SECRET
```

Wait ~30-60 seconds (it's pulling ~10 categories), then reload the homepage.

## 4. Deploy to Vercel

1. Push to GitHub, import into Vercel
2. Add all the same environment variables in Vercel → Project Settings → Environment Variables
3. Deploy

Vercel will automatically read `vercel.json` and run `/api/sync` every day
at 3 AM UTC — as long as `CRON_SECRET` is set as an environment variable,
Vercel authenticates the cron request automatically.

## 5. Expanding the catalog

Edit `SEED_KEYWORDS` in `pages/api/sync.js` to add more product categories.
Each keyword pulls up to 50 products. More keywords = bigger catalog, but
also longer sync time — if you add many, consider running sync more than
once via the manual URL rather than waiting for the daily cron.

## Notes

- The `/api/sync` endpoint is only ever called by Vercel Cron or manually
  by you with the secret — never by end users, and it never runs during
  a search request. That's what keeps searches fast.
- Accessories (cases, cables, chargers...) are auto-flagged during sync
  and excluded from results by default — see `lib/normalize.js` to tune
  the word list.
