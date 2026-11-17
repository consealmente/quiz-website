-- One private document for the quiz library. Never expose this table to browser roles.
CREATE TABLE IF NOT EXISTS public.quiz_sync (
  id text PRIMARY KEY CHECK (id = 'personal'),
  state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(state) = 'object'),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quiz_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quiz_sync FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.quiz_sync TO service_role;
-- Access is exclusively via a Vercel function using the server-side service-role key,
-- after verifying the private device-pairing code. No public RLS policies are created.