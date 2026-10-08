<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * A saved query for a board: one table, tables joined in the join builder, or a SELECT written by
 * the admin; see DataSourceQuery for how each kind runs.
 *
 * @property string $uuid
 * @property string $name
 * @property string $kind "table", "join" or "sql"
 * @property string $table_name
 * @property list<array{table: string, type: string, from: string, to: string}>|null $joins
 * @property string|null $sql
 * @property list<string> $columns
 * @property list<array{column: string, operator: string, valueKind: string, value: ?string}> $filters
 * @property list<array{column: string, direction: string}> $sort
 * @property int $row_limit
 * @property int $cache_seconds
 */
class BoardDataSource extends Model
{
    protected $fillable = [
        'name',
        'kind',
        'table_name',
        'joins',
        'sql',
        'columns',
        'filters',
        'sort',
        'row_limit',
        'cache_seconds',
    ];

    protected $casts = [
        'columns' => 'array',
        'joins' => 'array',
        'filters' => 'array',
        'sort' => 'array',
        'row_limit' => 'integer',
        'cache_seconds' => 'integer',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $source) {
            $source->uuid ??= (string) Str::uuid();
        });
    }

    /**
     * The query as plain data, the form DataSourceQuery runs.
     *
     * @return array{kind: string, table: string, joins: list<array>, sql: ?string, columns: list<string>, filters: list<array>, sort: list<array>, limit: int}
     */
    public function definition(): array
    {
        return [
            'kind' => $this->kind ?? 'table',
            'table' => $this->table_name,
            'joins' => $this->joins ?? [],
            'sql' => $this->sql,
            'columns' => $this->columns ?? [],
            'filters' => $this->filters ?? [],
            'sort' => $this->sort ?? [],
            'limit' => $this->row_limit,
        ];
    }
}
