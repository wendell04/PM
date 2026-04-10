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
        if (strpos($token, '|') === false) {
            return static::where(
                'token', hash('sha256', $token)
            )->first();
        }

        [$id, $token] = explode('|', $token, 2);

        $instance = static::find($id);

        if ($instance) {
            return hash('sha256', $token) === $instance->token
                ? $instance : null;
        }
    }
}
