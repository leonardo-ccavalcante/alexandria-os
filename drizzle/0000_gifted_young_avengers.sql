CREATE TABLE `catalog_masters` (
	`isbn13` varchar(13) NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`publisher` text,
	`publicationYear` int,
	`language` varchar(5),
	`synopsis` text,
	`category` enum('LITERATURA','HISTORIA','CIENCIA','ARTE','INFANTIL','ENSAYO','OTROS') DEFAULT 'OTROS',
	`bisacCode` varchar(20),
	`coverImageUrl` text,
	`marketMinPrice` decimal(6,2),
	`marketMedianPrice` decimal(6,2),
	`lastPriceCheck` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `catalog_masters_isbn13` PRIMARY KEY(`isbn13`)
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`uuid` varchar(36) NOT NULL,
	`isbn13` varchar(13) NOT NULL,
	`status` enum('INGESTION','AVAILABLE','LISTED','RESERVED','SOLD','REJECTED','DONATED','MISSING') NOT NULL DEFAULT 'INGESTION',
	`conditionGrade` enum('COMO_NUEVO','BUENO','ACEPTABLE') NOT NULL,
	`conditionNotes` text,
	`locationCode` varchar(3),
	`listingPrice` decimal(6,2),
	`costOfGoods` decimal(6,2) DEFAULT '0.00',
	`soldAt` timestamp,
	`soldChannel` varchar(50),
	`finalSalePrice` decimal(6,2),
	`platformFees` decimal(6,2),
	`netProfit` decimal(6,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `inventory_items_uuid` PRIMARY KEY(`uuid`)
);
--> statement-breakpoint
CREATE TABLE `sales_transactions` (
	`transactionId` varchar(36) NOT NULL,
	`itemUuid` varchar(36) NOT NULL,
	`isbn13` varchar(13) NOT NULL,
	`channel` varchar(50) NOT NULL,
	`saleDate` timestamp NOT NULL DEFAULT (now()),
	`listingPrice` decimal(6,2) NOT NULL,
	`finalSalePrice` decimal(6,2) NOT NULL,
	`platformCommissionPct` decimal(5,2),
	`platformFees` decimal(6,2) NOT NULL,
	`shippingCost` decimal(6,2) DEFAULT '0.00',
	`grossProfit` decimal(6,2),
	`netProfit` decimal(6,2),
	`daysInInventory` int,
	`transactionNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `sales_transactions_transactionId` PRIMARY KEY(`transactionId`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`settingKey` varchar(100) NOT NULL,
	`settingValue` text NOT NULL,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_settingKey` PRIMARY KEY(`settingKey`)
);
--> statement-breakpoint
--> statement-breakpoint
CREATE INDEX `idx_masters_category` ON `catalog_masters` (`category`);--> statement-breakpoint
CREATE INDEX `idx_items_isbn` ON `inventory_items` (`isbn13`);--> statement-breakpoint
CREATE INDEX `idx_items_status` ON `inventory_items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_items_location` ON `inventory_items` (`locationCode`);--> statement-breakpoint
CREATE INDEX `idx_items_created_at` ON `inventory_items` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_transactions_item` ON `sales_transactions` (`itemUuid`);--> statement-breakpoint
CREATE INDEX `idx_transactions_isbn` ON `sales_transactions` (`isbn13`);--> statement-breakpoint
CREATE INDEX `idx_transactions_channel` ON `sales_transactions` (`channel`);--> statement-breakpoint
CREATE INDEX `idx_transactions_date` ON `sales_transactions` (`saleDate`);