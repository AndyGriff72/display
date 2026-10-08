<?php

namespace App\Http\Controllers;

use App\Models\Board;
use Illuminate\Http\JsonResponse;

/**
 * A board as a screen shows it, by its unguessable key.
 *
 * Open, like the board data, because screens do not sign in. It gives away only what the screen
 * puts on public display anyway: the layout, and the key of the data source it reads. updatedAt
 * lets a screen tell, when it checks back, whether the board has been edited since.
 */
class ScreenController extends Controller
{
    public function show(string $uuid): JsonResponse
    {
        $board = Board::where('uuid', $uuid)->first();

        if ($board === null) {
            return response()->json(['status' => 404, 'data' => null, 'message' => 'There is no such board.'], 404);
        }

        return response()->json([
            'status' => 200,
            'data' => [
                'name' => $board->name,
                'layout' => $board->layout,
                'updatedAt' => $board->updated_at?->toIso8601String(),
            ],
            'message' => '',
        ]);
    }
}
