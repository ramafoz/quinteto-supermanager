CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`league_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`at` integer NOT NULL,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_league_id` ON `audit_events` (`league_id`,`id`);--> statement-breakpoint
CREATE TABLE `roster_observations` (
	`user_id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`ids_json` text NOT NULL,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `rounds` ADD `acb_journey_id` text;--> statement-breakpoint
ALTER TABLE `rounds` ADD `acb_journey_number` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `penalty_reduction` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `scores_json` text;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `scores_at` integer;