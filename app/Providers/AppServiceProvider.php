<?php

namespace App\Providers;

use App\Connections\ConnectionProvider;
use App\Connections\SavedConnectionProvider;
use App\Services\CredentialKeyProvider;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Encryption\Encrypter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
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
        // Sign-in attempts, limited as Redbrix limits them: five a minute for an address and
        // email together, twenty a minute for an address whatever email it tries.
        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute(5)
                ->by(Str::lower((string) $request->input('email')) . '|' . $request->ip())
                ->response(fn () => back()
                    ->withInput($request->except('password'))
                    ->withErrors(['email' => 'Too many sign-in attempts. Please wait a minute and try again.'])),
            Limit::perMinute(20)->by($request->ip()),
        ]);
    }
}
