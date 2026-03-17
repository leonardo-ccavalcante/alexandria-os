CREATE TABLE `libraries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`description` text,
	`ownerId` int NOT NULL,
	`storageQuotaMb` int NOT NULL DEFAULT 500,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `libraries_id` PRIMARY KEY(`id`),
	CONSTRAINT `libraries_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `library_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`libraryId` int NOT NULL,
	`code` varchar(36) NOT NULL,
	`email` varchar(320),
	`role` enum('admin','member') NOT NULL DEFAULT 'member',
	`createdBy` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedBy` int,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `library_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `library_invitations_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `library_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`libraryId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `library_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `export_history` ADD `libraryId` int;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `libraryId` int;--> statement-breakpoint
ALTER TABLE `sales_transactions` ADD `libraryId` int;--> statement-breakpoint
CREATE INDEX `idx_libraries_owner` ON `libraries` (`ownerId`);--> statement-breakpoint
CREATE INDEX `idx_libraries_slug` ON `libraries` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_invitations_code` ON `library_invitations` (`code`);--> statement-breakpoint
CREATE INDEX `idx_invitations_library` ON `library_invitations` (`libraryId`);--> statement-breakpoint
CREATE INDEX `idx_invitations_expires` ON `library_invitations` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `idx_members_library_user` ON `library_members` (`libraryId`,`userId`);--> statement-breakpoint
CREATE INDEX `idx_members_user` ON `library_members` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_items_library` ON `inventory_items` (`libraryId`);--> statement-breakpoint
CREATE INDEX `idx_transactions_library` ON `sales_transactions` (`libraryId`);