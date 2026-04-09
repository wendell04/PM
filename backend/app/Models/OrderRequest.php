<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class OrderRequest extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'order_requests';

    protected $fillable = [
        'customerId',
        'customerName',
        'customerEmail',
        'productId',
        'productName',
        'productThumbnail',
        'category',
        'priceType',
        'selectedVariants',
        'quantity',
        'designUrl',
        'designNotes',
        'suggestedPrice',
        'finalPrice',
        'status',
        'statusHistory',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        'quantity'         => 'integer',
        'suggestedPrice'   => 'float',
        'finalPrice'       => 'float',
        'createdAt'        => 'datetime',
        'updatedAt'        => 'datetime',
    ];

    protected $attributes = [
        'status'           => 'pending_review',
        'statusHistory'    => [],
        'selectedVariants' => [],
    ];

    // Scopes
    public function scopePending($query)
    {
        return $query->where('status', 'pending_review');
    }

    public function scopeByCustomer($query, $customerId)
    {
        return $query->where('customerId', $customerId);
    }
}
