<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * An uploaded image, shown on boards at /images/{uuid}.
 *
 * @property string $uuid
 * @property string $name
 * @property string $mime
 * @property int $size
 * @property string $path
 */
class BoardImage extends Model
{
    /** The storage disk the files are on: see config/filesystems.php. */
    public const DISK = 'board_images';

    protected $fillable = ['name', 'mime', 'size', 'path'];

    protected static function booted(): void
    {
        static::creating(function (self $image) {
            $image->uuid ??= (string) Str::uuid();
        });
    }

    /** The address a layout uses for this image. */
    public function url(): string
    {
        return '/images/' . $this->uuid;
    }

    /**
     * The boards whose layouts show this image. Found by the image's key alone, which is unique:
     * a layout is stored as JSON, which may write the slashes in its address as "\/".
     */
    public function boards(): Collection
    {
        return Board::where('layout', 'like', '%' . $this->uuid . '%')->orderBy('name')->get(['id', 'name']);
    }
}
