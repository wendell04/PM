<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;
use Laravel\Sanctum\Contracts\HasAbilities;

class PersonalAccessToken extends Model implements HasAbilities
{
    protected $connection = 'mongodb';
    protected $collection = 'personal_access_tokens';

    protected $fillable = [
        'name',
        'token',
        'abilities',
        'expires_at',
        'last_used_at',
        'tokenable_id',
        'tokenable_type',
        'ip',
        'userAgent',
    ];

    protected $casts = [
        'abilities'    => 'json',
        'last_used_at' => 'datetime',
        'expires_at'   => 'datetime',
        'ip'           => 'string',
        'userAgent'    => 'string',
    ];

    protected $hidden = ['token'];

    public function tokenable()
    {
        return $this->morphTo('tokenable');
    }

    public function can($ability)
    {
        return in_array('*', $this->abilities ?? [])
            || in_array($ability, $this->abilities ?? []);
    }

    public function cant($ability)
    {
        return ! $this->can($ability);
    }

    /**
     * Find a token by its plain-text value.
     * Called by Sanctum middleware on every request.
     */
    public static function findToken($token)
    {
        try {
            if (strpos($token, '|') === false) {
                $instance = static::where('token', hash('sha256', $token))->first();
            } else {
                [$id, $token] = explode('|', $token, 2);
                $instance = static::find($id);
                if ($instance && hash('sha256', $token) !== $instance->token) $instance = null;
            }

            // A sign-in past its lifetime or unused too long is no sign-in (App\Support\SessionRules).
            // Checked here rather than only in Sanctum's guard because three controllers look tokens
            // up directly, and those accepted an expired token outright.
            if ($instance && !\App\Support\SessionRules::isLive($instance, $instance->tokenable?->role)) {
                return null;
            }
            return $instance;
        } catch (\MongoDB\Driver\Exception\ConnectionTimeoutException $e) {
            \Illuminate\Support\Facades\Log::error('MongoDB unreachable (Sanctum): ' . $e->getMessage());
            abort(503, 'Database temporarily unavailable.');
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Token lookup failed: ' . $e->getMessage());
            abort(503, 'Database temporarily unavailable.');
        }
    }
}
