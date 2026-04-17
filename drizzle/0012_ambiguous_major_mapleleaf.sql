ALTER TABLE `shelfAuditSessions` MODIFY COLUMN `expectedItemUuids` json NOT NULL;--> statement-breakpoint
ALTER TABLE `shelfAuditSessions` MODIFY COLUMN `confirmedItemUuids` json NOT NULL;--> statement-breakpoint
ALTER TABLE `shelfAuditSessions` MODIFY COLUMN `conflictItems` json NOT NULL;