ALTER TABLE "users" ADD COLUMN "username" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_salt" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" varchar(128);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");