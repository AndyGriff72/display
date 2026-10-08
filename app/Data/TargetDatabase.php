<?php

namespace App\Data;

use Illuminate\Database\Connection;

/**
 * The database a board reads from, and everything that differs between engines when reading it:
 * what tables and columns it has, and how to make a query read-only and time-limited.
 *
 * DataSourceQuery builds its queries against this, never against an engine directly, which is
 * also what lets the tests run the real query building against SQLite.
 */
interface TargetDatabase
{
    public function connection(): Connection;

    /**
     * Tables and views in the connected schema, by name.
     *
     * @return list<array{name: string, type: 'table'|'view'}>
     */
    public function tables(): array;

    /**
     * A table's columns, in table order. Empty when there is no such table.
     *
     * @return list<array{name: string, type: string}>
     */
    public function columns(string $table): array;

    /**
     * Run $read inside a read-only transaction with a statement time limit, and return what it
     * returns. The builder only ever writes SELECTs; this makes sure nothing else could run.
     *
     * @template T
     * @param callable(Connection): T $read
     * @return T
     */
    public function readOnly(callable $read): mixed;
}
