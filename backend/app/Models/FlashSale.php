<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class FlashSale extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'flash_sales';

    protected $fillable = [
        'productId',
        'productName',
        'productThumbnail',
        'discountType',
        'discountValue',
        'startDate',
        'endDate',
        'isActive',
        'createdBy',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        'discountValue' => 'float',
        'isActive'      => 'boolean',
        'startDate'     => 'datetime',
        'endDate'       => 'datetime',
        'createdAt'     => 'datetime',
        'updatedAt'     => 'datetime',
    ];

    protected $attributes = [
        'isActive' => true,
    ];

    // Only isActive = true
    public function scopeActive($query)
    {
        return $query->where('isActive', true);
    }

    // isActive = true AND startDate <= now AND endDate >= now
    public function scopeLive($query)
    {
        $now = now();
        return $query->where('isActive', true)
                     ->where('startDate', '<=', $now)
                     ->where('endDate', '>=', $now);
    }
}
