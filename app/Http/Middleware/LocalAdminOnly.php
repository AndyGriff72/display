<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Admin requests only from this machine, until the board has logins.
 *
 * There is one admin and no sign-in yet, so the only thing standing between the saved database
 * connection and anyone who can reach the server is where the request comes from. Fine on a
 * development machine; not enough behind a reverse proxy on the same host, where every request
 * appears to come from this machine. Logins must replace this before the board is deployed.
 */
class LocalAdminOnly
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!in_array($request->ip(), ['127.0.0.1', '::1'], true)) {
            return response()->json([
                'status' => 403,
                'data' => null,
                'message' => 'The board can only be set up from the machine it runs on.',
            ], 403);
        }

        return $next($request);
    }
}
