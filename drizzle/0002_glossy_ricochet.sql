ALTER TABLE `rounds` ADD `ends_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `raw_points` real;