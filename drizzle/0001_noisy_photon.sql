CREATE TABLE `mutation_receipts` (
	`workspace` text NOT NULL,
	`actor` text NOT NULL,
	`request_id` text NOT NULL,
	`digest` text NOT NULL,
	`response` text NOT NULL,
	`status` integer NOT NULL,
	`applied` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace`, `actor`, `request_id`),
	CONSTRAINT "mutation_applied" CHECK("mutation_receipts"."applied" = 1)
);
--> statement-breakpoint
CREATE INDEX `idx_receipts_created` ON `mutation_receipts` (`created_at`);--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace` text NOT NULL,
	`ride_id` text NOT NULL,
	`recipient_role` text NOT NULL,
	`recipient_id` text NOT NULL,
	`phone` text NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`provider_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_outbox_workspace_status` ON `notification_outbox` (`workspace`,`status`);--> statement-breakpoint
CREATE INDEX `idx_outbox_provider` ON `notification_outbox` (`provider_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_expiry` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `ride_locations` (
	`workspace` text NOT NULL,
	`ride_id` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`accuracy` real NOT NULL,
	`captured_at` text NOT NULL,
	`received_at` text NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`workspace`, `ride_id`)
);
--> statement-breakpoint
ALTER TABLE `workspaces` ADD `revision` integer DEFAULT 0 NOT NULL;