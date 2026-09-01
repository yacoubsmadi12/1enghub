ALTER TABLE "users" ADD COLUMN "employee_number" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "manager_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_manager_idx" ON "users" USING btree ("manager_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_number_unique" UNIQUE("employee_number");