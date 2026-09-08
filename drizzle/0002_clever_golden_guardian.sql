CREATE TABLE `request_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace` text,
	`created_at` text NOT NULL,
	`actor_id` text,
	`actor_email` text,
	`actor_role` text,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status` integer NOT NULL,
	`duration_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_requests_workspace_time` ON `request_logs` (`workspace`,`created_at`,`id`);--> statement-breakpoint
ALTER TABLE `events` ADD `actor_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `actor_email` text;--> statement-breakpoint
ALTER TABLE `events` ADD `actor_role` text;--> statement-breakpoint
ALTER TABLE `events` ADD `action` text;--> statement-breakpoint
ALTER TABLE `events` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `entity_kind` text;--> statement-breakpoint
ALTER TABLE `events` ADD `entity_id` text;--> statement-breakpoint
ALTER TABLE `members` ADD `grant_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `members` SET `grant_id` = lower(hex(randomblob(16))) WHERE `grant_id` = '';
