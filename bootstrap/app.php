<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // A board layout is stored exactly as the editor sends it. Trimming would strip the blank
        // flap from the front of a split-flap stack, and spaces that are meant to be shown from
        // fixed text and templates; turning "" into null would change a layout's meaning too.
        $savingBoard = fn (Request $request) => $request->is('api/boards', 'api/boards/*');
        $middleware->trimStrings(except: [$savingBoard]);
        $middleware->convertEmptyStringsToNull(except: [$savingBoard]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
