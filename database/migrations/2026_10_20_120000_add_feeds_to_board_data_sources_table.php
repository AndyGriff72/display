<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * News feed data sources (kind "rss"): one or more RSS or Atom feeds, merged. See NewsFeeds.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('board_data_sources', function (Blueprint $table) {
            /** For "rss": [{ url, name? }], in the order given. */
            $table->json('feeds')->nullable()->after('sql');
            /** For "rss": the time zone story times are shown in, e.g. "Europe/London". */
            $table->string('timezone', 64)->nullable()->after('feeds');
        });
    }

    public function down(): void
    {
        Schema::table('board_data_sources', function (Blueprint $table) {
            $table->dropColumn(['feeds', 'timezone']);
        });
    }
};
