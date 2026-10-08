<?php

use App\Http\Controllers\ConnectionController;
use App\Http\Middleware\LocalAdminOnly;
use Illuminate\Support\Facades\Route;

// The board's JSON API. Under the web middleware group, as Redbrix's is, so the React app's
// requests carry the session and CSRF token.
Route::prefix('api')->group(function () {
    Route::middleware(LocalAdminOnly::class)->group(function () {
        Route::get('/connection', [ConnectionController::class, 'show']);
        Route::put('/connection', [ConnectionController::class, 'save']);
        Route::post('/connection/test', [ConnectionController::class, 'test']);
        Route::delete('/connection', [ConnectionController::class, 'destroy']);
    });

    // An API address that does not exist is a JSON 404, not the app's page.
    Route::any('/{any}', fn () => response()->json(['status' => 404, 'data' => null, 'message' => 'Not found.'], 404))
        ->where('any', '.*');
});

// The board editor is a single-page React app; every page it routes to itself is served
// the same shell, as Redbrix's SPA is.
Route::fallback(fn () => view('app'));
