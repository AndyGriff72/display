<?php

namespace App\Data;

use Illuminate\Database\Connection;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\QueryException;
use PDO;
use PDOException;

/**
 * Turns a data source definition into rows. Three kinds:
 *
 * - "table": one table or view, some of its columns, filtered, sorted and limited.
 * - "join": the same, starting from one table and joining others on "this column equals that
 *   column", as built in the editor's join builder.
 * - "sql": a SELECT written by the admin, in the connected database's own dialect.
 *
 * For tables and joins nothing in a definition reaches the SQL as text: every table and column
 * is checked against the database's own catalogue first, the query builder quotes them,
 * operators come from a fixed list and values are always bound parameters.
 *
 * Written SQL is the admin's own and runs as it is written, inside guards: it is wrapped as
 * `SELECT * FROM (...) LIMIT n`, so it must be a single SELECT and the row limit holds; it is
 * prepared natively, which refuses more than one statement; and, like every query here, it runs
 * read-only and time-limited (see TargetDatabase::readOnly). The database user's own permissions
 * remain the real limit on what it can read, which is why the connection should use a user that
 * can only read.
 */
class DataSourceQuery
{
    /** Most rows a data source may ask for. A board shows a screenful, not a report. */
    public const MAX_ROWS = 100;

    public const KINDS = ['table', 'join', 'sql'];

    /** Longest SQL accepted, in characters. */
    public const MAX_SQL_LENGTH = 20000;

    /** Operators a filter may use, by the name the editor sends. */
    public const OPERATORS = [
        'equals' => '=',
        'not_equals' => '<>',
        'less_than' => '<',
        'at_most' => '<=',
        'greater_than' => '>',
        'at_least' => '>=',
        'contains' => 'contains',
        'starts_with' => 'starts_with',
        'has_value' => 'not_null',
        'has_no_value' => 'null',
    ];

    /**
     * What a filter compares against: the value typed, or the database's own clock — so a
     * departures board can ask for "from now on" with no disagreement about time zones between
     * this server and the database.
     */
    public const VALUE_KINDS = ['value', 'now', 'today'];

    public const JOIN_TYPES = ['inner', 'left'];

    public function __construct(private TargetDatabase $database)
    {
    }

    /**
     * Everything wrong with a definition, as messages a person can act on. Empty means it can run
     * (for written SQL: it is the right shape; whether the database accepts it shows on running).
     *
     * @return list<string>
     */
    public function problems(array $definition): array
    {
        $kind = $definition['kind'] ?? 'table';
        if (!in_array($kind, self::KINDS, true)) {
            return ['Choose one table, joined tables or your own SQL.'];
        }

        $problems = $kind === 'sql' ? $this->sqlProblems($definition) : $this->builtProblems($definition, $kind === 'join');

        $limit = $definition['limit'] ?? null;
        if (!is_int($limit) || $limit < 1 || $limit > self::MAX_ROWS) {
            $problems[] = 'Ask for between 1 and ' . self::MAX_ROWS . ' rows.';
        }

        return $problems;
    }

    /**
     * Run a definition, after checking it.
     *
     * @return array{columns: list<string>, rows: list<array<string, mixed>>}
     *
     * @throws InvalidDataSource when the definition does not fit the database
     * @throws QueryException when the database refuses the query
     */
    public function run(array $definition): array
    {
        if ($problems = $this->problems($definition)) {
            throw new InvalidDataSource($problems);
        }

        if (($definition['kind'] ?? 'table') === 'sql') {
            return $this->database->readOnly(fn (Connection $c) => $this->runSql($c, $definition));
        }

        $refs = array_values(array_map('strval', $definition['columns']));
        $names = $this->outputNames($refs, ($definition['kind'] ?? 'table') === 'join');

        $rows = $this->database->readOnly(
            fn (Connection $connection) => $this->build($connection, $definition, $refs)->get()
        );

        return [
            'columns' => $names,
            'rows' => $rows->map(function ($row) use ($names) {
                $values = array_values((array) $row);

                return array_combine($names, $values);
            })->values()->all(),
        ];
    }

    // --- Tables and joins -----------------------------------------------------------------------

    /**
     * @return list<string>
     */
    private function builtProblems(array $definition, bool $joined): array
    {
        $base = (string) ($definition['table'] ?? '');
        $tables = array_column($this->database->tables(), 'name');

        if (!in_array($base, $tables, true)) {
            return [$base === '' ? 'Choose a table.' : "There is no table or view called \"{$base}\"."];
        }

        $problems = [];
        /** @var array<string, list<string>> $columnsOf the tables in the query, and their columns */
        $columnsOf = [$base => array_column($this->database->columns($base), 'name')];

        if ($joined) {
            foreach ($definition['joins'] ?? [] as $i => $join) {
                $n = $i + 1;
                $table = (string) ($join['table'] ?? '');
                if (!in_array($table, $tables, true)) {
                    $problems[] = "Join {$n}: there is no table or view called \"{$table}\".";
                    continue;
                }
                if (isset($columnsOf[$table])) {
                    $problems[] = "Join {$n}: \"{$table}\" is already in this query. Each table can be used once.";
                    continue;
                }
                if (!in_array($join['type'] ?? 'inner', self::JOIN_TYPES, true)) {
                    $problems[] = "Join {$n}: choose whether to keep rows with no match.";
                }
                if ($why = $this->unknownReference((string) ($join['from'] ?? ''), $columnsOf)) {
                    $problems[] = "Join {$n}: {$why}";
                }
                $columnsOf[$table] = array_column($this->database->columns($table), 'name');
                if (!in_array((string) ($join['to'] ?? ''), $columnsOf[$table], true)) {
                    $problems[] = "Join {$n}: \"{$table}\" has no column called \"" . ($join['to'] ?? '') . '".';
                }
            }
        }

        $check = fn (string $ref) => $joined
            ? $this->unknownReference($ref, $columnsOf)
            : (in_array($ref, $columnsOf[$base], true) ? null : "\"{$base}\" has no column called \"{$ref}\".");

        $columns = $definition['columns'] ?? [];
        if (!is_array($columns) || $columns === []) {
            $problems[] = 'Choose at least one column.';
        } else {
            foreach ($columns as $column) {
                if ($why = $check((string) $column)) {
                    $problems[] = ucfirst($why);
                }
            }
        }

        foreach ($definition['filters'] ?? [] as $i => $filter) {
            $n = $i + 1;
            if ($why = $check((string) ($filter['column'] ?? ''))) {
                $problems[] = "Filter {$n}: {$why}";
            }
            if (!isset(self::OPERATORS[$filter['operator'] ?? ''])) {
                $problems[] = "Filter {$n}: choose how to compare.";
            }
            $kind = $filter['valueKind'] ?? 'value';
            if (!in_array($kind, self::VALUE_KINDS, true)) {
                $problems[] = "Filter {$n}: compare with a value, now or today.";
            } elseif ($kind !== 'value' && in_array(self::OPERATORS[$filter['operator'] ?? ''] ?? null, ['contains', 'starts_with'], true)) {
                $problems[] = "Filter {$n}: now and today can only be compared with equals, before or after.";
            }
        }

        foreach ($definition['sort'] ?? [] as $i => $sort) {
            if ($why = $check((string) ($sort['column'] ?? ''))) {
                $problems[] = 'Sort ' . ($i + 1) . ": {$why}";
            }
            if (!in_array($sort['direction'] ?? 'asc', ['asc', 'desc'], true)) {
                $problems[] = 'Sort ' . ($i + 1) . ': sort ascending or descending.';
            }
        }

        return $problems;
    }

    /**
     * Why "table.column" does not name a column of a table in the query, or null when it does.
     *
     * @param array<string, list<string>> $columnsOf
     */
    private function unknownReference(string $ref, array $columnsOf): ?string
    {
        $dot = strrpos($ref, '.');
        if ($dot === false) {
            return "say which table \"{$ref}\" comes from, as table.column.";
        }
        [$table, $column] = [substr($ref, 0, $dot), substr($ref, $dot + 1)];
        if (!isset($columnsOf[$table])) {
            return "\"{$table}\" is not one of the tables in this query.";
        }

        return in_array($column, $columnsOf[$table], true) ? null : "\"{$table}\" has no column called \"{$column}\".";
    }

    /**
     * What each chosen column is called in the rows, and so in templates. For one table, its
     * name. For joined tables, also its name, unless two tables both have a column of that name,
     * in which case both are called table.column.
     *
     * @param list<string> $refs
     * @return list<string>
     */
    public function outputNames(array $refs, bool $joined): array
    {
        if (!$joined) {
            return $refs;
        }
        $short = array_map(fn ($ref) => substr($ref, strrpos($ref, '.') + 1), $refs);
        $counts = array_count_values($short);

        return array_map(fn ($ref, $name) => $counts[$name] > 1 ? $ref : $name, $refs, $short);
    }

    /** @param list<string> $refs */
    private function build(Connection $connection, array $definition, array $refs): Builder
    {
        $joined = ($definition['kind'] ?? 'table') === 'join';
        $query = $connection->table($definition['table']);

        if ($joined) {
            foreach ($definition['joins'] ?? [] as $join) {
                $method = ($join['type'] ?? 'inner') === 'left' ? 'leftJoin' : 'join';
                $query->{$method}($join['table'], $join['from'], '=', $join['table'] . '.' . $join['to']);
            }
        }

        // Selected under plain positional names (c0, c1, ...) and renamed afterwards, since a
        // joined column's name contains a dot that SQL would read as table.column.
        $query->select(array_map(fn ($ref, $i) => "{$ref} as c{$i}", $refs, array_keys($refs)));

        $wrap = fn (string $column) => $query->getGrammar()->wrap($column);

        foreach ($definition['filters'] ?? [] as $filter) {
            $column = (string) $filter['column'];
            $operator = self::OPERATORS[$filter['operator']];
            $value = match ($filter['valueKind'] ?? 'value') {
                'now' => $connection->raw('CURRENT_TIMESTAMP'),
                'today' => $connection->raw('CURRENT_DATE'),
                default => (string) ($filter['value'] ?? ''),
            };

            match ($operator) {
                'null' => $query->whereNull($column),
                'not_null' => $query->whereNotNull($column),
                // LIKE with an explicit escape character, so a % or _ typed in a filter means
                // itself on every engine (SQLite has no default escape character at all).
                'contains' => $query->whereRaw($wrap($column) . " LIKE ? ESCAPE '!'", ['%' . $this->escapeLike((string) $value) . '%']),
                'starts_with' => $query->whereRaw($wrap($column) . " LIKE ? ESCAPE '!'", [$this->escapeLike((string) $value) . '%']),
                default => $query->where($column, $operator, $value),
            };
        }

        foreach ($definition['sort'] ?? [] as $sort) {
            $query->orderBy((string) $sort['column'], ($sort['direction'] ?? 'asc') === 'desc' ? 'desc' : 'asc');
        }

        return $query->limit((int) $definition['limit']);
    }

    private function escapeLike(string $value): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value);
    }

    // --- Written SQL ------------------------------------------------------------------------------

    /**
     * @return list<string>
     */
    private function sqlProblems(array $definition): array
    {
        $sql = trim((string) ($definition['sql'] ?? ''));
        if ($sql === '') {
            return ['Write the SELECT that gives the board its rows.'];
        }
        if (mb_strlen($sql) > self::MAX_SQL_LENGTH) {
            return ['That SQL is too long: keep it under ' . number_format(self::MAX_SQL_LENGTH) . ' characters.'];
        }
        // Skipping any comments at the start, it must begin as a query does. Anything else would
        // fail anyway, read-only and wrapped; this just says why in plain words.
        if (!preg_match('~^(?:\s+|--[^\n]*(?:\n|$)|/\*.*?\*/)*(select|with)\b~is', $sql)) {
            return ['Your SQL must be a SELECT (or WITH … SELECT). The board only ever reads.'];
        }

        return [];
    }

    /**
     * @return array{columns: list<string>, rows: list<array<string, mixed>>}
     */
    private function runSql(Connection $connection, array $definition): array
    {
        $sql = rtrim(trim((string) $definition['sql']), "; \t\n\r");
        $wrapped = 'SELECT * FROM (' . $sql . "\n) board_query LIMIT " . (int) $definition['limit'];

        try {
            $statement = $connection->getPdo()->prepare($wrapped);
            $statement->execute();
            $columns = [];
            for ($i = 0; $i < $statement->columnCount(); $i++) {
                $columns[] = (string) ($statement->getColumnMeta($i)['name'] ?? "column{$i}");
            }
            $rows = $statement->fetchAll(PDO::FETCH_NUM);
        } catch (PDOException $e) {
            throw new QueryException($connection->getName(), $wrapped, [], $e);
        }

        return [
            'columns' => $columns,
            'rows' => array_map(fn ($row) => array_combine($columns, $row), $rows),
        ];
    }
}
