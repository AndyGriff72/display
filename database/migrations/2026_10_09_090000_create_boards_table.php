<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Saved boards: a name and the whole layout, appearance included, as the editor builds it.
 *
 * Named so nothing in Redbrix's database clashes with it (Redbrix has no `board*` tables), and,
 * like organization_connections here, carrying a nullable organization_id with no foreign key:
 * there are no organizations in the board app, and a merge into Redbrix fills it in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('boards', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id')->nullable()->index();
            // The key in the address a screen shows this board at: unguessable, like a data
            // source's, so nobody finds every board by counting.
            $table->uuid('uuid')->unique();
            $table->string('name');
            /** The BoardLayout as JSON: grid, cell appearance, sound, statics, fields, lists. */
            $table->json('layout');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('boards');
    }
};
