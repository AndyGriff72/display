<?php

namespace App\Http\Controllers;

use App\Data\TargetDatabases;
use Illuminate\Http\JsonResponse;

/**
 * What the connected database has to offer: its tables and views, and each one's columns.
 * Feeds the data source editor's choices.
 */
class SchemaController extends Controller
{
    public function __construct(private TargetDatabases $databases)
    {
    }

    public function tables(): JsonResponse
    {
        return $this->read(fn ($db) => $db->tables());
    }

    public function columns(string $table): JsonResponse
    {
        return $this->read(fn ($db) => $db->columns($table));
    }

    /** The links between tables the database knows, which the join builder offers as joins. */
    public function foreignKeys(): JsonResponse
    {
        return $this->read(fn ($db) => $db->foreignKeys());
    }

    private function read(callable $read): JsonResponse
    {
        $database = $this->databases->current();

        if ($database === null) {
            return response()->json(['status' => 409, 'data' => null, 'message' => 'Save a database connection first.'], 409);
        }

        try {
            return response()->json(['status' => 200, 'data' => $read($database), 'message' => '']);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'status' => 502,
                'data' => null,
                'message' => 'Could not read the database. Check the connection on the Connection page.',
            ], 502);
        }
    }
}
