CREATE TABLE `price_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`isbn13` varchar(13) NOT NULL,
	`marketplace` varchar(50) NOT NULL,
	`price` decimal(6,2),
	`condition` enum('NUEVO','COMO_NUEVO','BUENO','ACEPTABLE'),
	`url` text,
	`available` enum('YES','NO') NOT NULL DEFAULT 'YES',
	`scrapedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_price_history_isbn` ON `price_history` (`isbn13`);--> statement-breakpoint
CREATE INDEX `idx_price_history_scraped_at` ON `price_history` (`scrapedAt`);