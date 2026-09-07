<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Conversation extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'conversations';

    protected $fillable = [
        'participants', // Array of user IDs
        'order_id',     // Optional link to an order
        'last_message',
        'last_message_at',
        'is_active',
        'subject',      // For email/contact form threads
        // Which guest a participant-less thread belongs to. Without it every guest collapses
        // into the single conversation whose only member is the shop.
        'guest_email',
    ];

    protected $casts = [
        'last_message_at' => 'datetime',
        'is_active'       => 'boolean',
    ];

    public function messages()
    {
        return $this->hasMany(Message::class);
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
