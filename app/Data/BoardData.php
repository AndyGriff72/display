<?php

namespace App\Data;

use App\Models\BoardDataSource;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * A data source's rows as screens see them: shared, briefly reused, and kept on screen when the
 * database has a bad moment.
 *
 * Every screen showing a board asks for its data on a timer. The result is reused for the data
 * source's cache_seconds, so ten screens cost the database one query per period, not ten.
 *
 * The last good result is also kept for a day. If the database cannot be reached, screens get
 * that, marked stale, rather than a blank board — a departures board that goes dark because the
 * database restarted is worse than one a minute out of date.
 */
class BoardData
{
    private const LAST_GOOD_SECONDS = 86400;

    public function __construct(private TargetDatabases $databases)
    {
    }

    /**
     * @return array{columns: list<string>, rows: list<array<string, mixed>>, fetchedAt: string, stale: bool}
     *
     * @throws \Throwable when the data cannot be fetched and there is no earlier result to fall back on
     */
    public function for(BoardDataSource $source): array
    {
        // The definition is part of the key, so editing a data source takes effect at once.
        $key = 'board-data:' . $source->id . ':' . md5(json_encode($source->definition()));
        $lastGoodKey = 'board-data-last-good:' . $source->id;

        try {
            return Cache::remember($key, max(1, $source->cache_seconds), function () use ($source, $lastGoodKey) {
                $database = $this->databases->current()
                    ?? throw new \RuntimeException('No database connection has been saved.');

                $result = (new DataSourceQuery($database))->run($source->definition())
                    + ['fetchedAt' => now()->toIso8601String(), 'stale' => false];

                Cache::put($lastGoodKey, $result, self::LAST_GOOD_SECONDS);

                return $result;
            });
        } catch (\Throwable $e) {
            Log::warning('Board data could not be fetched.', ['data_source' => $source->id, 'error' => $e->getMessage()]);

            $lastGood = Cache::get($lastGoodKey);
            if ($lastGood !== null) {
                return ['stale' => true] + $lastGood;
            }

            throw $e;
        }
    }
}
