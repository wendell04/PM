<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Message extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'messages';

    protected $fillable = [
        'conversation_id',
        'sender_id',
        'sender_name',
        'sender_email', // For non-registered users (Contact form)
        'body',
        'type',        // text, image, order_reference
        'file_url',    // For images
        'metadata',    // For extra data like order details snapshot
        // The sender's own id for this message, echoed back so a browser can recognise its own
        // optimistic bubble. Mass assignment drops anything not listed here, silently.
        'client_key',
        'is_read',
        'read_at',
    ];

    protected $casts = [
        'is_read'  => 'boolean',
        'read_at'  => 'datetime',
        'metadata' => 'array',
    ];

    public function conversation()
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sender()
    {
        return $this->belongsTo(User::class, 'sender_id');
    }
}
