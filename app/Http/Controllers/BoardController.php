<?php

namespace App\Http\Controllers;

use App\Models\Board;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Saving and opening boards in the editor.
 */
class BoardController extends Controller
{
    /** Largest layout accepted, in bytes of JSON. Generous, since a logo may be a data: URL. */
    private const MAX_LAYOUT_BYTES = 2_000_000;

    public function index(): JsonResponse
    {
        return response()->json([
            'status' => 200,
            'data' => Board::orderBy('name')->get(['id', 'uuid', 'name', 'updated_at'])->map(fn ($b) => [
                'id' => $b->id,
                'uuid' => $b->uuid,
                'name' => $b->name,
                'updatedAt' => $b->updated_at?->toIso8601String(),
            ]),
            'message' => '',
        ]);
    }

    public function show(Board $board): JsonResponse
    {
        return response()->json(['status' => 200, 'data' => $this->present($board), 'message' => '']);
    }

    public function store(Request $request): JsonResponse
    {
        $board = Board::create($this->validated($request));

        return response()->json(['status' => 200, 'data' => $this->present($board), 'message' => 'Board saved.']);
    }

    public function update(Request $request, Board $board): JsonResponse
    {
        $board->update($this->validated($request));

        return response()->json(['status' => 200, 'data' => $this->present($board), 'message' => 'Board saved.']);
    }

    public function destroy(Board $board): JsonResponse
    {
        $board->delete();

        return response()->json(['status' => 200, 'data' => null, 'message' => 'Board deleted.']);
    }

    private function validated(Request $request): array
    {
        $input = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'layout' => ['required', 'array'],
            'layout.columns' => ['required', 'integer', 'between:1,200'],
            'layout.rows' => ['required', 'integer', 'between:1,100'],
            'layout.cell' => ['required', 'array'],
            // Keep in step with CELL_TYPES and FINISHES in resources/js/board/layout.ts.
            'layout.cell.type' => ['required', 'in:splitflap,dotmatrix,segment,flipdot,text'],
            'layout.cell.finish' => ['sometimes', 'in:led,vfd,bulb'],
            'layout.cell.width' => ['required', 'integer', 'between:4,1000'],
            'layout.cell.height' => ['required', 'integer', 'between:4,1000'],
            'layout.statics' => ['sometimes', 'array'],
            'layout.fields' => ['sometimes', 'array'],
            'layout.lists' => ['sometimes', 'array'],
        ], [
            'name.required' => 'Give the board a name.',
            'layout.columns.between' => 'A board can be up to 200 columns wide.',
            'layout.rows.between' => 'A board can be up to 100 rows high.',
        ]);

        if (strlen(json_encode($input['layout'])) > self::MAX_LAYOUT_BYTES) {
            abort(response()->json([
                'status' => 422,
                'data' => null,
                'message' => 'This layout is too large to save. A logo stored in it as a data: address is the usual cause; link to the image instead.',
            ], 422));
        }

        // The whole layout as sent, not just the keys checked above.
        return ['name' => $input['name'], 'layout' => $request->input('layout')];
    }

    private function present(Board $board): array
    {
        return [
            'id' => $board->id,
            'uuid' => $board->uuid,
            'name' => $board->name,
            'layout' => $board->layout,
            'updatedAt' => $board->updated_at?->toIso8601String(),
        ];
    }
}
