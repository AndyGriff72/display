<?php

namespace Tests\Support;

use App\Data\TargetDatabase;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;

/**
 * An in-memory SQLite database standing in for the board's target database, so the real query
 * building and checking run in tests without a database server.
 *
 * Read-only is enforced with SQLite's query_only pragma, the nearest thing it has to a
 * read-only transaction.
 */
class SqliteTargetDatabase implements TargetDatabase
{
    public const NAME = 'test_target';

    public static function create(): self
    {
        config(['database.connections.' . self::NAME => [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
            'foreign_key_constraints' => true,
        ]]);
        DB::purge(self::NAME);

        return new self();
    }

    public function connection(): Connection
    {
        return DB::connection(self::NAME);
    }

    public function tables(): array
    {
        $rows = $this->connection()->select(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
        );

        return array_map(fn ($r) => ['name' => $r->name, 'type' => $r->type], $rows);
    }

    public function columns(string $table): array
    {
        $rows = $this->connection()->select('SELECT name, type FROM pragma_table_info(?)', [$table]);

        return array_map(fn ($r) => ['name' => $r->name, 'type' => strtolower($r->type)], $rows);
    }

    public function readOnly(callable $read): mixed
    {
        $connection = $this->connection();
        $connection->statement('PRAGMA query_only = ON');

        try {
            return $read($connection);
        } finally {
            $connection->statement('PRAGMA query_only = OFF');
        }
    }
}
