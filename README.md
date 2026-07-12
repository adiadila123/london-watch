# London Community Watch — deploy in 10 minutes

## 1. Supabase (backend)
1. Create a free project at supabase.com.
2. Open **SQL Editor → New query**, paste the whole of `setup.sql`, press **Run**.
   This creates the `reports` table, RLS policies, the `increment_confirmations`
   function, Realtime and the public `report-photos` Storage bucket.
3. Go to **Settings → API** and copy the **Project URL** and the **anon public** key.

## 2. Frontend
1. Open `index.html` and replace the two `// TODO: Înlocuiește aici` values
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
2. That's it — no build step, no npm.

## 3. Deploy
- **Netlify:** drag the folder onto app.netlify.com/drop.
- **Vercel:** `vercel` in the folder, or import from a GitHub repo.

Photos, geolocation and Realtime all work over HTTPS, which both hosts give you by default. Test locally with `python3 -m http.server` if you like (geolocation also works on `localhost`).
