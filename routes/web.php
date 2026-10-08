<?php

use Illuminate\Support\Facades\Route;

// The board editor is a single-page React app; every page it routes to itself is served
// the same shell, as Redbrix's SPA is.
Route::fallback(fn () => view('app'));
