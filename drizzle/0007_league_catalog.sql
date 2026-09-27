CREATE TABLE `league_catalogs` (
	`league_id` text NOT NULL,
	`season` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`checked_at` integer,
	`document_json` text NOT NULL,
	`confirmed_json` text NOT NULL,
	`history_json` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`league_id`, `season`),
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action
);
