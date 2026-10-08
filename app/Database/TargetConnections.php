<?php

namespace App\Database;

use Illuminate\Support\Facades\DB;

/**
 * Builds the Laravel connections that reach a customer's database, for whichever engine it is.
 *
 * Two connections, always: one for the data and one for the catalogue. On MySQL and MariaDB the
 * catalogue is a database of its own, INFORMATION_SCHEMA, so it needs a connection pointed there.
 * On PostgreSQL information_schema is a schema inside the database being read, so both point at
 * the same place. Callers do not need to know which — they get two names that work.
 *
 * Built from scratch rather than by overwriting a few keys of a connection that happened to exist.
 * The target connection used to be `mysql` with its host and credentials replaced, which worked
 * only because every customer database was MySQL: a PostgreSQL connection needs a different
 * driver and different settings altogether (sslmode, search_path), not a different host.
 *
 * Copied from Redbrix unchanged apart from where the PDO options come from: Redbrix keeps them on
 * DatabaseConnectionService, which the board does not have, so here they are in ConnectionOptions.
 * Keep the two in step.
 */
final class TargetConnections
{
    /**
     * Point the two named connections at the database these parameters describe.
     *
     * @param array{host: string, port: string|int, database: string, username: string, password?: string, ssl?: mixed, driver?: string|null, schema?: string|null} $params
     */
    public static function configure(string $dataName, string $catalogName, array $params): void
    {
        $engine = DatabaseEngines::normalize($params['driver'] ?? null);

        [$data, $catalog] = DatabaseEngines::family($engine) === DatabaseEngines::POSTGRESQL
            ? self::postgresql($params)
            : self::mysql($params);

        config([
            "database.connections.{$dataName}" => $data,
            "database.connections.{$catalogName}" => $catalog,
        ]);

        // Dropped rather than reconnected: a connection already made under these names belongs to
        // the previous configuration, and the next query should open one to the new target. The
        // new one is made lazily, at first use, as it always was.
        DB::purge($dataName);
        DB::purge($catalogName);
    }

    /**
     * MySQL and MariaDB alike: Laravel's mysql driver, which is what every target connection used
     * before engines were a choice, so a MariaDB connection behaves exactly as it always has.
     *
     * Charset and collation follow the application's own MySQL settings, as they did when the
     * target connection was that connection with its host replaced.
     *
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    private static function mysql(array $params): array
    {
        $template = config('database.connections.mysql', []);

        $data = [
            'driver' => 'mysql',
            'host' => $params['host'],
            'port' => $params['port'],
            'database' => $params['database'],
            'username' => $params['username'],
            'password' => $params['password'] ?? '',
            // Never a socket or a URL: those belong to the application's own database, and either
            // one, inherited, would quietly override the host the person typed.
            'unix_socket' => '',
            'url' => null,
            'charset' => $template['charset'] ?? 'utf8mb4',
            'collation' => $template['collation'] ?? 'utf8mb4_unicode_ci',
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => $template['strict'] ?? true,
            'engine' => null,
            'options' => ConnectionOptions::forTarget($params['ssl'] ?? null),
        ];

        $catalog = array_merge($data, [
            'database' => config('database.connections.mysql_information_schema.database', 'INFORMATION_SCHEMA'),
        ]);

        return [$data, $catalog];
    }

    /**
     * PostgreSQL: the catalogue is a schema inside the database, so both connections are the same.
     *
     * TLS is requested with sslmode — "require" when the person asked for it, which refuses an
     * unencrypted connection rather than falling back, and "prefer" otherwise. How this is worded
     * on the form, and whether certificates are verified, is item 4's D1.
     *
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    private static function postgresql(array $params): array
    {
        $ssl = filter_var($params['ssl'] ?? false, FILTER_VALIDATE_BOOLEAN);

        $data = [
            'driver' => 'pgsql',
            'host' => $params['host'],
            'port' => $params['port'],
            'database' => $params['database'],
            'username' => $params['username'],
            'password' => $params['password'] ?? '',
            'url' => null,
            'charset' => 'utf8',
            'prefix' => '',
            'prefix_indexes' => true,
            // The connection's chosen schema (roadmap item 4, C5), so an unqualified table name
            // means a table there — which is how every query Redbrix writes names one. Laravel
            // quotes it, so a schema name with capitals or spaces still resolves.
            'search_path' => DatabaseEngines::schemaFor(DatabaseEngines::POSTGRESQL, $params['schema'] ?? null),
            'sslmode' => $ssl ? 'require' : 'prefer',
            'options' => [\PDO::ATTR_TIMEOUT => ConnectionOptions::CONNECT_TIMEOUT_SECONDS],
        ];

        return [$data, $data];
    }
}
