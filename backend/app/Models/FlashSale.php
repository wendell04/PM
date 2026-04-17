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
        'stockLimit',
        'stockUsed',
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
        'stockLimit'    => 'integer',
        'stockUsed'     => 'integer',
    ];

    protected $attributes = [
        'isActive'   => true,
        'stockLimit' => null,
        'stockUsed'  => 0,
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
