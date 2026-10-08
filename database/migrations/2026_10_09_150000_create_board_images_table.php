<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Images uploaded for boards' static areas: logos and the like.
 *
 * The files themselves live on the `board_images` storage disk (local to begin with, S3 by
 * configuration); this records what each one is. Prefixed `board_` and carrying a nullable
 * organization_id with no foreign key, like the board app's other tables, for a Redbrix merge.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('board_images', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id')->nullable()->index();
            // In the image's address, /images/{uuid}: unguessable, and never reused, so an image
            // can be cached for good.
            $table->uuid('uuid')->unique();
            /** The file's name as uploaded, to recognise it by. */
            $table->string('name');
            /** As the server found it from the file's content, not as the browser claimed. */
            $table->string('mime', 64);
            $table->unsignedInteger('size');
            $table->string('path');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('board_images');
    }
};
