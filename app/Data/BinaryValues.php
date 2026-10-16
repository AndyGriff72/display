<?php

namespace App\Data;

/**
 * Values from binary columns (BLOB, bytea, varbinary), made fit to send to a board.
 *
 * Raw bytes cannot go in JSON at all: one would make the whole response fail. So an image
 * (recognised by its first bytes, not by what the column is called) becomes a data: URL a
 * board can draw, and any other binary value becomes null. Text, numbers and the rest are
 * untouched.
 *
 * Only PNG, JPEG, GIF and WebP are recognised. SVG is text, so it arrives as text and the board
 * decides whether to draw it as an image (see imageSource in resources/js/board/images.ts).
 */
final class BinaryValues
{
    /** Images larger than this are left out: screens fetch their data again every few seconds. */
    public const MAX_IMAGE_BYTES = 1024 * 1024;

    /** First bytes of each image type, as a pattern, and its media type. */
    private const SIGNATURES = [
        '/^\x89PNG\r\n\x1a\n/' => 'image/png',
        '/^\xff\xd8\xff/' => 'image/jpeg',
        '/^GIF8[79]a/' => 'image/gif',
        '/^RIFF.{4}WEBP/s' => 'image/webp',
    ];

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    public static function prepare(array $rows): array
    {
        return array_map(fn (array $row) => array_map(self::value(...), $row), $rows);
    }

    public static function value(mixed $value): mixed
    {
        // PostgreSQL's bytea comes as a stream.
        if (is_resource($value)) {
            $value = stream_get_contents($value);
        }
        if (!is_string($value)) {
            return $value;
        }

        $type = self::imageType($value);
        if ($type !== null) {
            return strlen($value) <= self::MAX_IMAGE_BYTES ? "data:{$type};base64," . base64_encode($value) : null;
        }

        return mb_check_encoding($value, 'UTF-8') ? $value : null;
    }

    /** The media type of an image in a known format, from its first bytes; null for anything else. */
    public static function imageType(string $bytes): ?string
    {
        $start = substr($bytes, 0, 16);
        foreach (self::SIGNATURES as $pattern => $type) {
            if (preg_match($pattern, $start)) {
                return $type;
            }
        }

        return null;
    }
}
