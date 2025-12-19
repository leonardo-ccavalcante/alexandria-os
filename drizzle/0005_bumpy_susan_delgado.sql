CREATE TABLE `database_activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` enum('insert','update','delete','bulk_update','bulk_delete') NOT NULL,
	`tableName` varchar(100) NOT NULL,
	`recordId` text,
	`changes` text,
	`recordCount` int DEFAULT 1,
	`userId` int,
	`userName` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `database_activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `export_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platform` varchar(50) NOT NULL,
	`exportDate` timestamp NOT NULL DEFAULT (now()),
	`itemCount` int NOT NULL,
	`withPrice` int DEFAULT 0,
	`withISBN` int DEFAULT 0,
	`filters` text,
	`status` enum('success','failed','partial') NOT NULL DEFAULT 'success',
	`errorMessage` text,
	`userId` int,
	`userName` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `export_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_activity_action` ON `database_activity_log` (`action`);--> statement-breakpoint
CREATE INDEX `idx_activity_table` ON `database_activity_log` (`tableName`);--> statement-breakpoint
CREATE INDEX `idx_activity_user` ON `database_activity_log` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_activity_timestamp` ON `database_activity_log` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_export_platform` ON `export_history` (`platform`);--> statement-breakpoint
CREATE INDEX `idx_export_date` ON `export_history` (`exportDate`);--> statement-breakpoint
CREATE INDEX `idx_export_user` ON `export_history` (`userId`);