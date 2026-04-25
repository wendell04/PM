<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Notification extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'notifications';

    protected $fillable = [
        'user_id',
        'type',
        'title',
        'message',
        'is_read',
        'data',
    ];

    protected $casts = [
        'is_read' => 'boolean',
        'data'    => 'array',
    ];

    protected $indexes = [
        ['key' => ['user_id' => 1, 'is_read' => 1]],
    ];

    protected static function booted(): void
    {
        static::created(function (self $notification) {
            try {
                broadcast(new \App\Events\UserNotificationCreated(
                    (string) $notification->user_id
                ));
            } catch (\Exception) {
                // Reverb may not be running; polling covers the gap
            }
        });
    }
}
