<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Review extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'reviews';

    protected $fillable = [
        'userId',
        'orderId',
        'productIds',
        // The single product a review is about. Order-level reviews written before this
        // existed leave it null, which is how they stay distinguishable.
        'productId',
        'rating',
        'comment',
        'customerName',
        'is_visible',
    ];

    protected $casts = [
        'rating'     => 'integer',
        'is_visible' => 'boolean',
    ];

    protected $indexes = [
        ['key' => ['orderId' => 1], 'unique' => true],
        ['key' => ['productIds' => 1]],
        ['key' => ['userId' => 1]],
        ['key' => ['created_at' => -1]],
    ];

    protected $attributes = [
        'is_visible' => true,
        'productIds' => [],
    ];
}
