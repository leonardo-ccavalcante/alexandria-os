CREATE TABLE `shelfAuditSessions` (
	`id` varchar(36) NOT NULL,
	`libraryId` int NOT NULL,
	`locationCode` varchar(10) NOT NULL,
	`status` enum('ACTIVE','COMPLETED','ABANDONED') NOT NULL DEFAULT 'ACTIVE',
	`startedBy` int NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`expectedItemUuids` json NOT NULL DEFAULT ('[]'),
	`confirmedItemUuids` json NOT NULL DEFAULT ('[]'),
	`conflictItems` json NOT NULL DEFAULT ('[]'),
	`photoAnalysisResult` json,
	CONSTRAINT `shelfAuditSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `location_log` MODIFY COLUMN `reason` varchar(100) DEFAULT 'import';--> statement-breakpoint
CREATE INDEX `idx_audit_library_status` ON `shelfAuditSessions` (`libraryId`,`status`);