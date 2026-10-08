<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * A saved board: its name and its whole layout.
 *
 * The layout is kept as the editor sends it. Its detailed rules (areas on the board, no
 * overlaps, list columns that fit) are checked by the editor as it is written, in layout.ts;
 * the server checks only that it is the right general shape, since a board that breaks a rule
 * still draws, just not as intended.
 *
 * @property string $uuid
 * @property string $name
 * @property array $layout
 */
class Board extends Model
{
    protected $fillable = ['name', 'layout'];

    protected $casts = ['layout' => 'array'];

    protected static function booted(): void
    {
        static::creating(function (self $board) {
            $board->uuid ??= (string) Str::uuid();
        });
    }
}
