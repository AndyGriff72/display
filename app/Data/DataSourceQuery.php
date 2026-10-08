<?php

namespace App\Data;

use Illuminate\Database\Connection;
use Illuminate\Database\Query\Builder;

/**
 * Turns a data source definition into rows.
 *
 * Nothing in a definition reaches the SQL as text. The table and every column are checked
 * against the database's own catalogue first, so only names that really exist are used, and the
 * query builder quotes them; operators come from a fixed list; values are always bound
 * parameters. The query then runs read-only and time-limited (see TargetDatabase::readOnly).
 */
class DataSourceQuery
{
    /** Most rows a data source may ask for. A board shows a screenful, not a report. */
    public const MAX_ROWS = 100;

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

    public function __construct(private TargetDatabase $database)
    {
    }

    /**
     * Everything wrong with a definition, as messages a person can act on. Empty means it can run.
     *
     * @param array{table?: mixed, columns?: mixed, filters?: mixed, sort?: mixed, limit?: mixed} $definition
     * @return list<string>
     */
    public function problems(array $definition): array
    {
        $table = (string) ($definition['table'] ?? '');
        $tables = array_column($this->database->tables(), 'name');

        if (!in_array($table, $tables, true)) {
            return [$table === '' ? 'Choose a table.' : "There is no table or view called \"{$table}\"."];
        }

        $known = array_column($this->database->columns($table), 'name');
        $problems = [];
        $unknown = fn (string $column) => !in_array($column, $known, true);

        $columns = $definition['columns'] ?? [];
        if (!is_array($columns) || $columns === []) {
            $problems[] = 'Choose at least one column.';
        } else {
            foreach ($columns as $column) {
                if ($unknown((string) $column)) {
                    $problems[] = "\"{$table}\" has no column called \"{$column}\".";
                }
            }
        }

        foreach ($definition['filters'] ?? [] as $i => $filter) {
            $n = $i + 1;
            $column = (string) ($filter['column'] ?? '');
            if ($unknown($column)) {
                $problems[] = "Filter {$n}: \"{$table}\" has no column called \"{$column}\".";
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
            $column = (string) ($sort['column'] ?? '');
            if ($unknown($column)) {
                $problems[] = 'Sort ' . ($i + 1) . ": \"{$table}\" has no column called \"{$column}\".";
            }
            if (!in_array($sort['direction'] ?? 'asc', ['asc', 'desc'], true)) {
                $problems[] = 'Sort ' . ($i + 1) . ': sort ascending or descending.';
            }
        }

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
     */
    public function run(array $definition): array
    {
        if ($problems = $this->problems($definition)) {
            throw new InvalidDataSource($problems);
        }

        $columns = array_values(array_map('strval', $definition['columns']));

        $rows = $this->database->readOnly(
            fn (Connection $connection) => $this->build($connection, $definition, $columns)->get()
        );

        return [
            'columns' => $columns,
            'rows' => $rows->map(fn ($row) => (array) $row)->values()->all(),
        ];
    }

    private function build(Connection $connection, array $definition, array $columns): Builder
    {
        $query = $connection->table($definition['table'])->select($columns);
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
}
