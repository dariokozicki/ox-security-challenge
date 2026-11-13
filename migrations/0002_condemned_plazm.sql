CREATE TABLE "snapshot_objects" (
	"key" text PRIMARY KEY NOT NULL,
	"expires" bigint NOT NULL,
	"purged" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "snapshot_key" text;--> statement-breakpoint
CREATE INDEX "scan_snapshot" ON "scans" USING btree ("snapshot_key");