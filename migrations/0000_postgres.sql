CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"until" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"created" bigint NOT NULL,
	"available" bigint NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"fence" uuid,
	"lease" bigint DEFAULT 0 NOT NULL,
	"idempotency" text NOT NULL,
	"request_hash" text NOT NULL,
	"doc" jsonb NOT NULL,
	"snapshot" jsonb,
	CONSTRAINT "scans_idempotency_unique" UNIQUE("idempotency")
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" text PRIMARY KEY NOT NULL,
	"heartbeat" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "scan_queue" ON "scans" USING btree ("status","available","created");