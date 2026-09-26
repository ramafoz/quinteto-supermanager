CREATE TABLE `leagues` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`invite_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leagues_invite_hash` ON `leagues` (`invite_hash`);--> statement-breakpoint
CREATE TABLE `acb_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`jwt` text NOT NULL,
	`expires_at` integer NOT NULL,
	`team_id` text,
	`team_name` text,
	`teams_json` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_members_league` ON `members` (`league_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_expiry` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`label` text NOT NULL,
	`lock_at` integer NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_rounds_league_lock` ON `rounds` (`league_id`,`lock_at`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`round_id` text NOT NULL,
	`user_id` text NOT NULL,
	`team_id` text NOT NULL,
	`team_name` text NOT NULL,
	`players_json` text NOT NULL,
	`imported_at` integer NOT NULL,
	PRIMARY KEY(`round_id`, `user_id`),
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE no action
);
