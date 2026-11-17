# Study Quiz Library

A personal quiz dashboard with **PSYCH 100 — Exam 3** (80 questions) as its first quiz. Features include randomized questions and answers, explanations for every answer, unlimited attempts, returning to unfinished attempts, reviewing completed attempts, missed-question practice, and copyable ChatGPT study reports.

## Architecture

- `index.html`: static quiz dashboard; localStorage fallback for offline use.
- `api/sync.js`: Vercel function; checks the device-pairing code, proxies authorized sync requests to Supabase Edge Functions.
- `supabase/functions/quiz-sync-personal/index.ts`: Supabase Edge Function; independently checks a SHA-256 digest of the pairing code, then accesses the database with Supabase's built-in server-side service-role credential.
- `supabase.sql`: creates the isolated `public.quiz_sync` table, enables RLS, revokes public roles, and grants service_role access.
- Supabase project: **scholaros** (existing project reused with owner's permission; unrelated data/tables are preserved).
- Vercel project: **quiz-website**, team **death16**, GitHub `consealmente/quiz-website`.

## Vercel environment variables

- `QUIZ_SYNC_CODE` — private device pairing code (sensitive)
- `SUPABASE_EDGE_SYNC_URL` — `https://gbqowowdkwxugqgwcitv.supabase.co/functions/v1/quiz-sync-personal`

**Never put the pairing code or a Supabase service-role/secret key in client-side HTML or GitHub.** The Edge Function source contains only the SHA-256 digest of the high-entropy pairing code, not the code itself. No Supabase service-role key is needed in Vercel.

## Usage

Visit the production website, choose **PSYCH 100 — Exam 3**, and create an attempt. Under **Cloud sync**, enter the private pairing code once on each device. Your answers and attempt history will then synchronize. The quiz continues working locally if the cloud is unavailable.

## Limitations

- Anyone with the public URL can view the quiz questions; only saved progress is protected by the pairing code.
- Anyone with the pairing code can read and change saved history. Keep it private.
- Avoid simultaneously editing the same attempt on two devices.
- Previous downloaded `file://` HTML quiz progress is not automatically imported into the website.
