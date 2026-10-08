<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Signing in and out, the way Redbrix's AccountController does it: Laravel's session guard,
 * Auth::attempt against the users table, the session id renewed on sign-in. There is no sign-up
 * page; the admin is created with `php artisan display:admin`.
 */
class LoginController extends Controller
{
    public function show()
    {
        return view('auth.login');
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);

        if (!Auth::attempt($credentials, $request->boolean('remember'))) {
            return redirect()->route('login')
                ->withInput($request->only('email', 'remember'))
                ->withErrors(['email' => 'These credentials do not match our records.']);
        }

        $request->session()->regenerate();
        $request->user()->forceFill(['last_seen_at' => now()])->save();

        return redirect()->intended('/');
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}
