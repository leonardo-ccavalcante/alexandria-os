CREATE TABLE `location_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemUuid` varchar(36) NOT NULL,
	`libraryId` int NOT NULL,
	`fromLocation` varchar(3),
	`toLocation` varchar(3),
	`changedBy` int,
	`reason` varchar(50) DEFAULT 'import',
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `location_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `lastVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `lastVerifiedBy` int;--> statement-breakpoint
ALTER TABLE `sales_transactions` ADD `lastVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `sales_transactions` ADD `lastVerifiedBy` int;