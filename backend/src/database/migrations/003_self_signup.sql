-- Self sign-up: new accounts can wait for approval (doctors; patients until they
-- are linked to their health record), and we remember how each account was made.
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password';
