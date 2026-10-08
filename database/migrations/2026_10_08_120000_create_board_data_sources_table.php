<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a board shows: one table (or view) from the connected database, which of its columns,
 * filtered, sorted and limited.
 *
 * Prefixed `board_` so it can sit in Redbrix's database beside Redbrix's own tables without a
 * clash. Which database it reads comes from the ConnectionProvider, not a column here; if a board
 * ever reads from more than one connection, a connection_id referencing organization_connections
 * goes here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('board_data_sources', function (Blueprint $table) {
            $table->id();
            // The key in the address screens fetch data from: unguessable, so nobody can walk
            // through every data source by counting.
            $table->uuid('uuid')->unique();
            $table->string('name');
            $table->string('table_name');
            /** Column names, in the order wanted. */
            $table->json('columns');
            /** [{ column, operator, valueKind, value }], all of which must match. */
            $table->json('filters');
            /** [{ column, direction }], first sort first. */
            $table->json('sort');
            $table->unsignedInteger('row_limit')->default(10);
            /** How long a result is reused before the database is asked again. */
            $table->unsignedInteger('cache_seconds')->default(30);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('board_data_sources');
    }
};
