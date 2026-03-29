-- Optional: run manually in Vercel Postgres / Supabase SQL editor.
-- The Node API also runs equivalent DDL via `ensureAdminUsersTable` on first admin request.

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email_lower ON public.admin_users (LOWER(email));

-- Example: add an admin (password hash must be produced by the app — use bootstrap endpoint or first login seed).
-- INSERT INTO public.admin_users (email, password_hash) VALUES ('you@example.com', 'v1$...');
