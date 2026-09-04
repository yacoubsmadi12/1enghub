CREATE TABLE IF NOT EXISTS "smtp_settings" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "host" varchar(255) NOT NULL,
  "port" integer NOT NULL DEFAULT 587,
  "secure" boolean NOT NULL DEFAULT false,
  "username" varchar(320) NOT NULL,
  "password_encrypted" text NOT NULL,
  "from_email" varchar(320) NOT NULL,
  "updated_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "password_reset_user_idx" ON "password_reset_tokens" ("user_id", "expires_at");
