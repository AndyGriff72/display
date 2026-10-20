<?php

namespace App\Http\Controllers;

use App\Data\BoardData;
use App\Models\BoardDataSource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The rows a screen shows, in Redbrix's envelope:
 *
 *   { status, data: [ { column: value, ... }, ... ], columns, fetchedAt, stale, refreshSeconds, message }
 *
 * refreshSeconds tells a screen how often to ask again: the data source's cache period, since
 * asking more often would only be handed the same result.
 *
 * Open to any screen, because screens do not sign in; what it serves is what the board puts on
 * public display anyway. The address uses the data source's random key, not its id. Failures are
 * reported without detail, since anyone can read them.
 */
class BoardDataController extends Controller
{
    public function __construct(private BoardData $data)
    {
    }

    public function show(Request $request, string $uuid): JsonResponse
    {
        $source = BoardDataSource::where('uuid', $uuid)->first();

        if ($source === null) {
            return response()->json(['status' => 404, 'data' => null, 'message' => 'There is no such data source.'], 404);
        }

        try {
            // ?feed=N: for a news feed source, just its Nth feed (from 0), as a board can choose.
            $feed = $request->query('feed');
            $result = $this->data->for($source, is_numeric($feed) ? (int) $feed : null);
        } catch (\Throwable) {
            return response()->json([
                'status' => 503,
                'data' => null,
                'message' => "The board's data is not available right now.",
            ], 503);
        }

        return response()->json([
            'status' => 200,
            'data' => $result['rows'],
            'columns' => $result['columns'],
            'fetchedAt' => $result['fetchedAt'],
            'stale' => $result['stale'],
            'refreshSeconds' => $source->cache_seconds,
            'message' => '',
        ]);
    }
}
