<?php

namespace App\Data;

use App\Database\DatabaseEngines;
use App\Database\TargetConnections;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;

/**
 * A real MySQL, MariaDB or PostgreSQL database, reached with Redbrix's TargetConnections.
 *
 * Redbrix reads its catalogue through a DiscoveryProvider per engine, which does far more than a
 * board needs (keys, privileges, statistics); the two catalogue queries here are the part of that
 * a board uses, and are the same SQL on every engine.
 */
class LiveTargetDatabase implements TargetDatabase
{
    private const DATA = 'board_target';
    private const CATALOG = 'board_target_catalog';

    /** Longest a board query may run, in seconds. A board wants a few rows, quickly. */
    public const STATEMENT_TIMEOUT_SECONDS = 5;

    private string $engine;
    private string $schema;

    /**
     * @param array{driver: string, host: string, port: int|string, database: string, schema: ?string, username: string, password: string, ssl: bool} $params
     */
    public function __construct(array $params)
    {
        $this->engine = DatabaseEngines::normalize($params['driver'] ?? null);
        $this->schema = DatabaseEngines::schemaFor($this->engine, $params['schema'] ?? null) ?? (string) $params['database'];

        TargetConnections::configure(self::DATA, self::CATALOG, $params);
    }

    public function connection(): Connection
    {
        return DB::connection(self::DATA);
    }

    public function tables(): array
    {
        $rows = DB::connection(self::CATALOG)->select(
            'SELECT table_name AS name, table_type AS type FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name',
            [$this->schema],
        );

        return array_map(fn ($row) => [
            'name' => (string) $row->name,
            'type' => str_contains(strtoupper((string) $row->type), 'VIEW') ? 'view' : 'table',
        ], $rows);
    }

    public function columns(string $table): array
    {
        $rows = DB::connection(self::CATALOG)->select(
            'SELECT column_name AS name, data_type AS type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position',
            [$this->schema, $table],
        );

        return array_map(fn ($row) => ['name' => (string) $row->name, 'type' => strtolower((string) $row->type)], $rows);
    }

    public function foreignKeys(): array
    {
        $catalog = DB::connection(self::CATALOG);

        $rows = DatabaseEngines::family($this->engine) === DatabaseEngines::POSTGRESQL
            ? $catalog->select(
                'SELECT kcu.table_name AS from_table, kcu.column_name AS from_column, ccu.table_name AS to_table, ccu.column_name AS to_column
                   FROM information_schema.table_constraints tc
                   JOIN information_schema.key_column_usage kcu
                     ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
                   JOIN information_schema.constraint_column_usage ccu
                     ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
                  WHERE tc.constraint_type = \'FOREIGN KEY\' AND tc.table_schema = ?
                  ORDER BY kcu.table_name, kcu.column_name',
                [$this->schema],
            )
            : $catalog->select(
                'SELECT table_name AS from_table, column_name AS from_column, referenced_table_name AS to_table, referenced_column_name AS to_column
                   FROM information_schema.key_column_usage
                  WHERE table_schema = ? AND referenced_table_name IS NOT NULL
                  ORDER BY table_name, column_name',
                [$this->schema],
            );

        return array_map(fn ($r) => [
            'fromTable' => (string) $r->from_table,
            'fromColumn' => (string) $r->from_column,
            'toTable' => (string) $r->to_table,
            'toColumn' => (string) $r->to_column,
        ], $rows);
    }

    public function readOnly(callable $read): mixed
    {
        $connection = $this->connection();
        $postgres = DatabaseEngines::family($this->engine) === DatabaseEngines::POSTGRESQL;

        if (!$postgres) {
            // MySQL and MariaDB: the time limit is per session, and SET TRANSACTION applies to the
            // next transaction, so both go before it starts.
            $connection->statement($this->engine === DatabaseEngines::MARIADB
                ? 'SET SESSION max_statement_time = ' . self::STATEMENT_TIMEOUT_SECONDS
                : 'SET SESSION MAX_EXECUTION_TIME = ' . (self::STATEMENT_TIMEOUT_SECONDS * 1000));
            $connection->statement('SET TRANSACTION READ ONLY');
        }

        $connection->beginTransaction();

        try {
            if ($postgres) {
                // PostgreSQL: both apply only inside the transaction they are set in.
                $connection->statement('SET TRANSACTION READ ONLY');
                $connection->statement('SET LOCAL statement_timeout = ' . (self::STATEMENT_TIMEOUT_SECONDS * 1000));
            }

            $result = $read($connection);
            $connection->commit();

            return $result;
        } catch (\Throwable $e) {
            $connection->rollBack();

            throw $e;
        }
    }
}
