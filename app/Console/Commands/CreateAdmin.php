<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * Create the admin who signs in to set boards up, or give an existing one a new password.
 *
 * There is no sign-up page, by design: one admin, created by whoever runs the server. The
 * password is asked for, never taken as an option, so it stays out of shell history.
 */
class CreateAdmin extends Command
{
    protected $signature = 'display:admin {email : The email address to sign in with} {--name= : Display name for a new admin}';

    protected $description = 'Create the board admin, or set a new password for an existing one';

    public function handle(): int
    {
        $email = strtolower(trim((string) $this->argument('email')));
        if (Validator::make(['email' => $email], ['email' => ['required', 'email']])->fails()) {
            $this->error("\"{$email}\" is not an email address.");

            return self::FAILURE;
        }

        $user = User::where('email', $email)->first();
        $name = $this->option('name') ?: $user?->name ?: $this->ask('Name', 'Admin');

        $password = $this->secret($user ? "New password for {$email}" : "Password for {$email}");
        $rules = ['password' => ['required', Password::min(10)]];
        if ($error = Validator::make(['password' => $password], $rules)->errors()->first('password')) {
            $this->error($error);

            return self::FAILURE;
        }
        if ($this->secret('The same password again') !== $password) {
            $this->error('The passwords do not match. Nothing was changed.');

            return self::FAILURE;
        }

        if ($user) {
            $user->forceFill(['name' => $name, 'password' => $password])->save();
            $this->info("Password changed for {$email}.");
        } else {
            User::create(['name' => $name, 'email' => $email, 'password' => $password]);
            $this->info("Admin {$email} created. Sign in at " . url('/login') . '.');
        }

        return self::SUCCESS;
    }
}
