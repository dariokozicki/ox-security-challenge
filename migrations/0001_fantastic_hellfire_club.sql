CREATE TABLE "api_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created" bigint NOT NULL,
	"model" text NOT NULL,
	"usage" jsonb
);
