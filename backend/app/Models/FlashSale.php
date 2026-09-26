<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class FlashSale extends Model
{
    // Every create, change and delete by a signed-in person lands in the audit trail.
    use \App\Models\Concerns\Auditable;
    protected string $auditEntity = 'flash_sale';
    protected array $auditIgnore = ['stockUsed'];

    protected $connection = 'mongodb';
    protected $collection = 'flash_sales';

    protected $fillable = [
        'productId',
        // Which variants the sale covers. Empty or absent means the whole product, which is
        // what every sale written before this meant and still means.
        'variantIds',
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
        'variantIds'    => 'array',
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
