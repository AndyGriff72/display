<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * Someone who can sign in to set boards up. For now, only ever the one admin, created with
 * `php artisan display:admin`.
 *
 * Shaped and configured as Redbrix's User over the same table (see the
 * add_redbrix_columns_to_users_table migration): the same fillable and hidden attributes, and
 * passwords hashed the same way, so the rows move into Redbrix and sign in there unchanged.
 * Redbrix's organizations, email verification and marketing consent are not here.
 */
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'provider',
        'provider_id',
        'avatar',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            // Deliberately absent from $fillable, as in Redbrix: written on sign-in, never from
            // request input.
            'last_seen_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
