<?php

use App\Http\Controllers\BoardDataController;
use App\Http\Controllers\ConnectionController;
use App\Http\Controllers\DataSourceController;
use App\Http\Controllers\SchemaController;
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

        Route::get('/schema/tables', [SchemaController::class, 'tables']);
        Route::get('/schema/tables/{table}/columns', [SchemaController::class, 'columns']);

        Route::get('/data-sources', [DataSourceController::class, 'index']);
        Route::post('/data-sources/preview', [DataSourceController::class, 'preview']);
        Route::post('/data-sources', [DataSourceController::class, 'store']);
        Route::put('/data-sources/{dataSource}', [DataSourceController::class, 'update']);
        Route::delete('/data-sources/{dataSource}', [DataSourceController::class, 'destroy']);
    });

    // What screens fetch. Open, because screens do not sign in; addressed by an unguessable key.
    Route::get('/board-data/{uuid}', [BoardDataController::class, 'show']);

    // An API address that does not exist is a JSON 404, not the app's page.
    Route::any('/{any}', fn () => response()->json(['status' => 404, 'data' => null, 'message' => 'Not found.'], 404))
        ->where('any', '.*');
});

// The board editor is a single-page React app; every page it routes to itself is served
// the same shell, as Redbrix's SPA is.
Route::fallback(fn () => view('app'));
