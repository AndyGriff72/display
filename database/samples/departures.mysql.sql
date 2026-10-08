-- Sample data for trying the board: a few train departures, timed from whenever this runs.
--
-- Run it in a scratch database (MySQL or MariaDB), not one that matters:
--
--   CREATE DATABASE display_sample;
--   USE display_sample;
--   SOURCE database/samples/departures.mysql.sql;
--
-- Then save a connection to display_sample, and a data source on `departures` with the
-- columns departs_at, destination, calling_at, platform and status; a filter "departs_at is
-- at least now"; sorted by departs_at ascending. The board's sample layout reads exactly
-- those columns. Run this again whenever the departures have all gone.
--
-- Read access is all the board needs:
--
--   CREATE USER 'board'@'localhost' IDENTIFIED BY 'choose-a-password';
--   GRANT SELECT ON display_sample.* TO 'board'@'localhost';

DROP TABLE IF EXISTS departures;

CREATE TABLE departures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    departs_at DATETIME NOT NULL,
    destination VARCHAR(40) NOT NULL,
    calling_at VARCHAR(120) NULL,
    platform VARCHAR(4) NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'ON TIME'
);

INSERT INTO departures (departs_at, destination, calling_at, platform, status) VALUES
    (NOW() + INTERVAL 2 MINUTE,  'LONDON EUSTON',   'CREWE, STAFFORD, MILTON KEYNES',            '4',  'ON TIME'),
    (NOW() + INTERVAL 9 MINUTE,  'MANCHESTER',      'WARRINGTON BANK QUAY',                      '11', 'DELAYED'),
    (NOW() + INTERVAL 17 MINUTE, 'EDINBURGH',       'CARLISLE, LOCKERBIE',                       '2',  'ON TIME'),
    (NOW() + INTERVAL 26 MINUTE, 'GLASGOW CENTRAL', 'PRESTON, LANCASTER, OXENHOLME, PENRITH',    '9',  'CANCELLED'),
    (NOW() + INTERVAL 34 MINUTE, 'BIRMINGHAM',      'STAFFORD, WOLVERHAMPTON',                   '1',  'ON TIME'),
    (NOW() + INTERVAL 48 MINUTE, 'LIVERPOOL',       'RUNCORN',                                   '6',  'ON TIME'),
    (NOW() - INTERVAL 5 MINUTE,  'HOLYHEAD',        'CHESTER, BANGOR',                           '3',  'DEPARTED');
