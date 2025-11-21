ALTER TABLE `catalog_masters` MODIFY COLUMN `language` varchar(2);--> statement-breakpoint
ALTER TABLE `catalog_masters` ADD `pages` int;--> statement-breakpoint
ALTER TABLE `catalog_masters` ADD `edition` varchar(50);