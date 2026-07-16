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
        'storeAddress',
        'storeLat',
        'storeLng',
        'shippingBaseRate',
        'shippingPerKmRate',
        'designRequestFee',
        'otp_locked_until',
        'failed_login_attempts',
        'login_locked_until',
        'verification_attempts',
        'two_factor_enabled',
        'unlock_requested_at',
        'last_seen_at',
        'two_factor_method',        // 'email' | 'totp'
        'totp_secret',
        'totp_confirmed',
        'totp_failed_attempts',
    ];

    protected $casts = [
        'addresses'              => 'array',
        'device_tokens'          => 'array',
        'storeLat'               => 'float',
        'storeLng'               => 'float',
        'shippingBaseRate'       => 'float',
        'shippingPerKmRate'      => 'float',
        'designRequestFee'       => 'float',
        'last_login_at'          => 'datetime',
        'failed_login_attempts'  => 'integer',
        'login_locked_until'     => 'datetime',
        'two_factor_enabled'     => 'boolean',
        'unlock_requested_at'    => 'datetime',
        'last_seen_at'           => 'datetime',
        'two_factor_method'      => 'string',
        'totp_confirmed'         => 'boolean',
        'totp_failed_attempts'   => 'integer',
        // PII encrypted at rest using APP_KEY — decrypted transparently on read
        'address'                => 'encrypted',
        // phoneNumber intentionally not encrypted: used in uniqueness index queries
        // totp_secret encrypted — never queried by value, only read per-user
        'totp_secret'            => 'encrypted',
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
        'totp_secret',
    ];

    /**
     * Session token lifetime by role + "remember me" (single source of truth for login,
     * refresh, and post-2FA token minting). Staff/admin sessions are short-lived when
     * "remember me" is off (sensitive accounts on shared devices); customers keep a long
     * shopping session. Tune the durations here only.
     */
    public function sessionExpiresAt(bool $rememberMe = false): \Carbon\Carbon
    {
        // No "remember me" → short session for everyone (shared/temporary device). This is the
        // server-side equivalent of a "just this visit" session; a true logout-on-browser-close
        // would additionally need sessionStorage on the client.
        if (!$rememberMe) {
            return now()->addDay();
        }

        // "Remember me" on → long session. Staff a bit shorter than customers (more sensitive).
        $isStaff = ($this->role ?? 'customer') !== 'customer';
        return $isStaff ? now()->addDays(30) : now()->addDays(90);
    }

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
