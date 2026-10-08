<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Saved database connections, in exactly the shape of Redbrix's `organization_connections`.
 *
 * Same table name, same columns, same types, same column order and the same index names as
 * Redbrix ends up with after all of its migrations (latest: 2026_10_02_100000). So if the board
 * becomes a Redbrix feature, its connections are already Redbrix connections: the rows copy across
 * with a plain INSERT ... SELECT, and anything here that refers to a connection id points at the
 * same kind of row there.
 *
 * Two deliberate differences, both because this app has no organizations:
 * - organization_id is nullable and has no foreign key. Redbrix requires it and constrains it to
 *   `organizations`; copy rows across with the id of the organization they belong to.
 * - policy_version is carried but unused: it belongs to Redbrix's permissions, which the board
 *   does not have. It stays so the columns line up.
 *
 * If Redbrix's table changes, change this to match.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_connections', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->string('name')->nullable();
            $table->string('driver', 20)->default('mysql');
            $table->string('host');
            $table->unsignedInteger('port')->default(3306);
            $table->string('database');
            $table->string('schema', 63)->nullable();
            $table->string('username');
            $table->boolean('ssl')->default(false);
            $table->unsignedBigInteger('policy_version')->default(0);
            $table->timestamp('verified_at')->nullable();
            $table->text('password_encrypted')->nullable();
            $table->foreignId('credential_saved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('credential_saved_at')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'host', 'port', 'database', 'username'], 'org_conn_unique_fingerprint');
            $table->index(['organization_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_connections');
    }
};
