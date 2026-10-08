<?php

namespace App\Data;

use App\Connections\ConnectionProvider;

/**
 * Opens the database the board reads from. Tests replace this to hand out SQLite instead.
 */
class TargetDatabases
{
    public function __construct(private ConnectionProvider $connections)
    {
    }

    /** The connected database, or null when no connection has been saved. */
    public function current(): ?TargetDatabase
    {
        $params = $this->connections->params();

        return $params === null ? null : new LiveTargetDatabase($params);
    }
}
