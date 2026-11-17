# Study Quiz Library

A personal quiz dashboard with **PSYCH 100 — Exam 3** (80 questions) as its first quiz. Features include randomized questions and answers, explanations for every answer, unlimited attempts, resuming unfinished attempts, reviewing past attempts, missed-question practice, and copyable ChatGPT study reports.

## Automatic shared history (no login or pairing)

Open the Vercel site on any device: the website automatically loads and saves the **same shared quiz history**. No account, email, password, or pairing code is required. LocalStorage keeps a local fallback if cloud syncing temporarily fails. Opening on a new device does not create a duplicate blank attempt when shared history exists.

**Privacy trade-off:** The production website and its /api/sync endpoint are publicly reachable. **Anyone with the website address can read, change, or overwrite your shared quiz progress.** Do not use this arrangement for private information. If privacy is required later, add site-level access control.

## Architecture

- `index.html`: static quiz dashboard and automatic cloud syncing.
- `api/sync.js`: public Vercel API route, forwards GET/PUT to the Supabase Edge Function with a **server-side** shared code.
- `supabase/functions/quiz-sync-personal/index.ts`: Edge Function independently checks a SHA-256 digest of the server-to-server code before accessing the database.
- `supabase.sql`: isolated `public.quiz_sync` table, RLS enabled and public roles revoked. No direct browser access to Supabase.
- Supabase project: **scholaros** (reused; other tables preserved).
- Vercel project: **quiz-website**, team **death16**, GitHub `consealmente/quiz-website`.

## Vercel environment variables

- `QUIZ_SYNC_CODE`: private **server-to-server** code (sensitive; never sent to the browser)
- `SUPABASE_EDGE_SYNC_URL`: `https://gbqowowdkwxugqgwcitv.supabase.co/functions/v1/quiz-sync-personal`

## Limitations

- Anyone with the URL can read and modify quiz history; there is no user-specific access control.
- Avoid simultaneously editing the same attempt on two different devices; the merge routine retains the first answer to each question.
- Previously downloaded `file://` HTML quiz progress is not automatically imported into the website.
