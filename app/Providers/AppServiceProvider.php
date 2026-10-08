<?php

namespace App\Providers;

use App\Connections\ConnectionProvider;
use App\Connections\SavedConnectionProvider;
use App\Services\CredentialKeyProvider;
use Illuminate\Encryption\Encrypter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(CredentialKeyProvider::class);

        // A dedicated encrypter for stored database passwords, keyed independently of APP_KEY,
        // under the same name and cipher Redbrix uses. Resolved lazily, so a request that never
        // touches a stored password never needs the key.
        $this->app->singleton('credential.encrypter', function ($app) {
            return new Encrypter($app->make(CredentialKeyProvider::class)->resolve(), 'aes-256-cbc');
        });

        // Where the board's data comes from. Swapped for a Redbrix-backed provider if the board
        // becomes part of Redbrix.
        $this->app->bind(ConnectionProvider::class, SavedConnectionProvider::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
