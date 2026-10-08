<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\BoardController;
use App\Http\Controllers\BoardDataController;
use App\Http\Controllers\ConnectionController;
use App\Http\Controllers\DataSourceController;
use App\Http\Controllers\ImageController;
use App\Http\Controllers\SchemaController;
use App\Http\Controllers\ScreenController;
use Illuminate\Support\Facades\Route;

// Signing in and out. No sign-up page: the admin is created with `php artisan display:admin`.
Route::middleware('guest')->group(function () {
    Route::get('/login', [LoginController::class, 'show'])->name('login');
    Route::post('/login', [LoginController::class, 'login'])->middleware('throttle:login');
});
Route::post('/logout', [LoginController::class, 'logout'])->middleware('auth')->name('logout');

// The board's JSON API. Under the web middleware group, as Redbrix's is, so the React app's
// requests carry the session and CSRF token. Setting up needs a signed-in user; a request
// without one is answered 401, which the app turns into a trip to the sign-in page.
Route::prefix('api')->group(function () {
    Route::middleware('auth')->group(function () {
        Route::get('/connection', [ConnectionController::class, 'show']);
        Route::put('/connection', [ConnectionController::class, 'save']);
        Route::post('/connection/test', [ConnectionController::class, 'test']);
        Route::delete('/connection', [ConnectionController::class, 'destroy']);

        Route::get('/schema/tables', [SchemaController::class, 'tables']);
        Route::get('/schema/tables/{table}/columns', [SchemaController::class, 'columns']);
        Route::get('/schema/foreign-keys', [SchemaController::class, 'foreignKeys']);

        Route::get('/data-sources', [DataSourceController::class, 'index']);
        Route::post('/data-sources/preview', [DataSourceController::class, 'preview']);
        Route::post('/data-sources', [DataSourceController::class, 'store']);
        Route::put('/data-sources/{dataSource}', [DataSourceController::class, 'update']);
        Route::delete('/data-sources/{dataSource}', [DataSourceController::class, 'destroy']);

        Route::get('/boards', [BoardController::class, 'index']);
        Route::post('/boards', [BoardController::class, 'store']);
        Route::get('/boards/{board}', [BoardController::class, 'show']);
        Route::put('/boards/{board}', [BoardController::class, 'update']);
        Route::delete('/boards/{board}', [BoardController::class, 'destroy']);

        Route::get('/images', [ImageController::class, 'index']);
        Route::post('/images', [ImageController::class, 'store']);
        Route::delete('/images/{image}', [ImageController::class, 'destroy']);
    });

    // What screens fetch. Open, because screens do not sign in; addressed by unguessable keys.
    Route::get('/board-data/{uuid}', [BoardDataController::class, 'show']);
    Route::get('/screens/{uuid}', [ScreenController::class, 'show']);

    // An API address that does not exist is a JSON 404, not the app's page.
    Route::any('/{any}', fn () => response()->json(['status' => 404, 'data' => null, 'message' => 'Not found.'], 404))
        ->where('any', '.*');
});

// A screen is the app's page too, but open to anyone with its address; so are the images
// boards show.
Route::get('/screen/{key}', fn () => view('app'));
Route::get('/images/{uuid}', [ImageController::class, 'show']);

// The board editor is a single-page React app; every page it routes to itself is served the
// same shell, as Redbrix's SPA is, once signed in.
Route::fallback(fn () => view('app'))->middleware('auth');
