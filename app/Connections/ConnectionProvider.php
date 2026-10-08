<?php

namespace App\Connections;

/**
 * Which database the board reads from.
 *
 * Everything that fetches board data asks this, never the saved-connection table directly, so
 * where the connection comes from can change without touching anything else. Here it is the one
 * connection the admin has saved. As a Redbrix feature it would be the signed-in person's own
 * Redbrix connection, whose session already holds its parameters in this same shape.
 */
interface ConnectionProvider
{
    /**
     * Connection parameters in the shape TargetConnections::configure() takes, password
     * included; or null when there is no connection to read from.
     *
     * @return array{driver: string, host: string, port: int|string, database: string, schema: ?string, username: string, password: string, ssl: bool}|null
     */
    public function params(): ?array;
}
