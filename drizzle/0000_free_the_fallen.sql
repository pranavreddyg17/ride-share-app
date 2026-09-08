CREATE TABLE `events` (
	`workspace` text NOT NULL,
	`id` text NOT NULL,
	`ride_id` text,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`workspace`, `id`),
	FOREIGN KEY (`workspace`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_workspace_time` ON `events` (`workspace`,`created_at`);--> statement-breakpoint
CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`role` text NOT NULL,
	`record_id` text,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_members_user` ON `members` (`user_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`workspace` text NOT NULL,
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`workspace`, `kind`, `id`),
	FOREIGN KEY (`workspace`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`settings` text NOT NULL,
	`created_at` text NOT NULL
);
