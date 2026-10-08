<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Data sources beyond a single table: tables joined in the editor's join builder, or a SELECT
 * written by the admin. See DataSourceQuery for how each runs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('board_data_sources', function (Blueprint $table) {
            /** "table", "join" or "sql". Every data source saved before this is a single table. */
            $table->string('kind', 10)->default('table')->after('name');
            /** For "join": [{ table, type, from: "table.column", to: "column" }], in order. */
            $table->json('joins')->nullable()->after('table_name');
            /** For "sql": the SELECT, as written. */
            $table->text('sql')->nullable()->after('joins');
        });
    }

    public function down(): void
    {
        Schema::table('board_data_sources', function (Blueprint $table) {
            $table->dropColumn(['kind', 'joins', 'sql']);
        });
    }
};
