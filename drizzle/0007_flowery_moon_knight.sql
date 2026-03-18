ALTER TABLE `library_members` ADD `joinedVia` enum('owner','invitation','manual') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `library_members` ADD `addedByUserId` int;--> statement-breakpoint
ALTER TABLE `library_members` ADD `lastActivityAt` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_members_last_activity` ON `library_members` (`lastActivityAt`);