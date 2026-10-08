<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Brings `users` to the shape of Redbrix's, so a board user is a Redbrix user: the rows copy
 * across as they are, and Redbrix's sign-in, which reads the same columns and checks the same
 * bcrypt password hashes, works with them unchanged.
 *
 * Redbrix reaches this shape over several migrations (2026_05_06_000000 social sign-in,
 * 2026_08_24_090000 last seen, 2026_09_09_100000 marketing consent, 2026_09_19_090000 ad
 * attribution). The board uses none of these columns but last_seen_at; the rest are here so the
 * tables match. Column positions follow Redbrix's on MySQL and MariaDB; SQLite ignores "after"
 * and adds them at the end, which changes nothing for a copy that names its columns.
 *
 * If Redbrix's users table changes, change this to match.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Redbrix allows a user with no password: one who signs in with Google or GitHub.
            $table->string('password')->nullable()->change();

            $table->string('provider')->nullable()->after('email');
            $table->string('provider_id')->nullable()->after('provider');
            $table->string('avatar')->nullable()->after('provider_id');

            $table->string('ad_click_id')->nullable()->after('email');
            $table->string('ad_click_id_type', 16)->nullable()->after('ad_click_id');
            $table->timestamp('ad_click_recorded_at')->nullable()->after('ad_click_id_type');

            $table->timestamp('last_seen_at')->nullable()->after('email_verified_at');
            $table->index('last_seen_at');

            $table->timestamp('marketing_opt_in_at')->nullable()->after('last_seen_at');
            $table->string('marketing_opt_in_source', 32)->nullable()->after('marketing_opt_in_at');
            $table->string('marketing_consent_version', 32)->nullable()->after('marketing_opt_in_source');
            $table->timestamp('marketing_prompted_at')->nullable()->after('marketing_consent_version');
            $table->index('marketing_opt_in_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['last_seen_at']);
            $table->dropIndex(['marketing_opt_in_at']);
            $table->dropColumn([
                'provider', 'provider_id', 'avatar',
                'ad_click_id', 'ad_click_id_type', 'ad_click_recorded_at',
                'last_seen_at',
                'marketing_opt_in_at', 'marketing_opt_in_source', 'marketing_consent_version', 'marketing_prompted_at',
            ]);
        });
    }
};
