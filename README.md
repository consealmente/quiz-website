# Study Quiz Library

A personal, growing quiz dashboard. The first quiz is **PSYCH 100 — Exam 3**, with 80 randomized questions, detailed explanations, repeated full attempts, answer review, missed-question retries, and exportable ChatGPT study reports.

## Architecture

- Static `index.html` containing the quiz and its content (no build step).
- Vercel `/api/sync` Node function for confidential cloud progress access.
- Supabase Postgres (`public.quiz_sync`) storing all attempt history in a single revisioned record.
- Browser localStorage for offline resilience.
- **No email/password login.** A private one-time *device pairing code* is required on each new device for cloud access. The code is stored in each device's browser. Anyone with it can read/write your history. There is no public browser access to Supabase.

## Deployment

The GitHub repo `consealmente/quiz-website` is linked to the existing `quiz-website` project in the Vercel team `death16`. Push to `main` to trigger a deployment.

Set these Vercel environment variables for **Production, Preview, Development**:

- `QUIZ_SYNC_CODE`: long unpredictable private code (20+ characters), known only to the owner and Vercel.
- `SUPABASE_URL`: HTTPS URL for a dedicated Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY`: secret service-role key. **Never publish this in GitHub, HTML, or JS sent to the browser.**

Create a dedicated Supabase project and execute `supabase.sql` there. The table has RLS enabled and no anonymous/authenticated access. The Vercel serverless function accesses it using the secret service-role key after validating the device pairing code. Set variables in Vercel and redeploy.

On each device: visit the Vercel site, open **Quiz Library**, enter the pairing code once under **Cloud sync**, then open or create attempts. Progress will synchronize when connected. The quiz still works locally before the database is connected.

## Caveats

- Public Vercel hosting means someone with the URL can *see the practice quiz*. Only cloud attempt history is private behind the pairing code. Website-level privacy needs deployment protection.
- Do not use the same attempt simultaneously on two different devices; revisions and attempt merges help but each device may move the current question independently.
- Existing `file://` quiz progress cannot be migrated automatically into Vercel; copy/export old reports if needed.
- Cloud sync is not ready until Supabase and server secrets are configured.