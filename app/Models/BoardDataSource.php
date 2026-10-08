<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * A saved query for a board: one table, some of its columns, filtered, sorted and limited.
 *
 * @property string $uuid
 * @property string $name
 * @property string $table_name
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
        'table_name',
        'columns',
        'filters',
        'sort',
        'row_limit',
        'cache_seconds',
    ];

    protected $casts = [
        'columns' => 'array',
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
     * @return array{table: string, columns: list<string>, filters: list<array>, sort: list<array>, limit: int}
     */
    public function definition(): array
    {
        return [
            'table' => $this->table_name,
            'columns' => $this->columns ?? [],
            'filters' => $this->filters ?? [],
            'sort' => $this->sort ?? [],
            'limit' => $this->row_limit,
        ];
    }
}
