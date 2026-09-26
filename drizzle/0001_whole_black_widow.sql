ALTER TABLE `rounds` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `baseline_json` text;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `changes_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `history_json` text DEFAULT '[]' NOT NULL;