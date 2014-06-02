
CREATE TABLE IF NOT EXISTS `roomPlayers` (
    `roomId` int(11) NOT NULL,
    `playerId` int(11) NOT NULL,
    PRIMARY KEY (`roomId`,`playerId`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

CREATE TABLE IF NOT EXISTS `rooms` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `uniqId` varchar(10) NOT NULL,
    `name` varchar(32) NOT NULL,
    `password` varchar(32) NOT NULL,
    `master` int(11) NOT NULL,
    `status` varchar(10) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniqId` (`uniqId`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `uniqId` varchar(10) NOT NULL,
    `username` varchar(32) NOT NULL,
    `email` varchar(128) NOT NULL,
    `password` varchar(50) NOT NULL,
    `salt` varchar(32) NOT NULL,
    `lastLogin` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniqId` (`uniqId`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;