<?php

namespace App\Models;

use MongoDB\Laravel\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, Notifiable;

    protected $connection = 'mongodb';
    protected $collection = 'users';

    protected $fillable = [
        'firstName',
        'middleInitial',
        'lastName',
        'address',
        'phoneNumber',
        'email',
        'password',
        'is_verified',
        'role',
        'verification_code',
        'verification_code_expires_at',
        'reset_token',
        'reset_token_expires_at',
        'reset_code',
        'reset_code_expires_at',
        'lastLogin',
        'avatar',
        'addresses', // Address book - array of saved addresses
        'device_tokens',
        'last_login_at',
        'storeName',
        'storeDescription',
        'storeEmail',
        'storePhone',
        'otp_locked_until',
        'failed_login_attempts',
        'login_locked_until',
        'verification_attempts',
        'two_factor_enabled',
        'unlock_requested_at',
        'last_seen_at',
    ];

    protected $casts = [
        'addresses'              => 'array',
        'device_tokens'          => 'array',
        'last_login_at'          => 'datetime',
        'failed_login_attempts'  => 'integer',
        'login_locked_until'     => 'datetime',
        'two_factor_enabled'     => 'boolean',
        'unlock_requested_at'    => 'datetime',
        'last_seen_at'           => 'datetime',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'api_token',
        'verification_code',
        'reset_token',
        'reset_token_expires_at',
        'reset_code',
        'reset_code_expires_at',
        'device_tokens',
    ];

    /**
     * Override Sanctum createToken to write
     * directly to MongoDB via our custom model.
     */
    public function createToken(
        string $name,
        array $abilities = ['*'],
        ?\DateTimeInterface $expiresAt = null
    ) {
        $plainText = config('sanctum.token_prefix', '')
            . \Illuminate\Support\Str::random(40);

        $token = PersonalAccessToken::create([
            'name'           => $name,
            'token'          => hash('sha256', $plainText),
            'abilities'      => $abilities,
            'expires_at'     => $expiresAt,
            'tokenable_id'   => (string) $this->_id,
            'tokenable_type' => static::class,
            'ip'             => request()->ip(),
            'userAgent'      => request()->userAgent(),
        ]);

        return new class($token, $plainText) {
            public string $plainTextToken;
            public function __construct(
                public $accessToken,
                string $plain
            ) {
                $this->plainTextToken = $plain;
            }
        };
    }
}
