<?php

namespace App\Database;

/**
 * PDO options for a connection to a database the board reads from.
 *
 * Redbrix keeps these on DatabaseConnectionService (connectionOptions() and
 * CONNECT_TIMEOUT_SECONDS); they are here word for word, because the board has no use for the
 * rest of that class. Keep the two in step.
 */
final class ConnectionOptions
{
    /**
     * How long to wait for a TCP connection before giving up, in seconds.
     *
     * Without this the driver inherits the operating system's default, around two minutes. A
     * database behind a firewall that drops packets rather than refusing them then hangs the
     * request for the full period. Ten seconds is far longer than any reachable host needs and
     * short enough to report.
     */
    public const CONNECT_TIMEOUT_SECONDS = 10;

    /**
     * Always carries the connect timeout above. When SSL is requested it also sets an (empty)
     * SSL CA — the presence of the option is what makes the mysqlnd client negotiate TLS — and
     * disables server-certificate verification so a self-signed certificate is accepted. That
     * encrypts the connection but does not verify the server's identity.
     */
    public static function forTarget($ssl): array
    {
        $options = [\PDO::ATTR_TIMEOUT => self::CONNECT_TIMEOUT_SECONDS];

        $enabled = $ssl !== null && filter_var($ssl, FILTER_VALIDATE_BOOLEAN);

        if (!$enabled || !class_exists(\Pdo\Mysql::class)) {
            return $options;
        }

        return $options + [
            \Pdo\Mysql::ATTR_SSL_CA => '',
            \Pdo\Mysql::ATTR_SSL_VERIFY_SERVER_CERT => false,
        ];
    }
}
