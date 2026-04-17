<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Voucher extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'vouchers';

    protected $fillable = [
        'code',
        'discountType',
        'discountValue',
        'minOrderAmount',
        'maxUses',
        'usedCount',
        'isActive',
        'expiresAt',
        'createdBy',
        'usedBy',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        'discountValue'  => 'float',
        'minOrderAmount' => 'float',
        'maxUses'        => 'integer',
        'usedCount'      => 'integer',
        'isActive'       => 'boolean',
        'expiresAt'      => 'datetime',
        'createdAt'      => 'datetime',
        'updatedAt'      => 'datetime',
        'usedBy'         => 'array',
    ];

    protected $attributes = [
        'isActive'  => true,
        'usedCount' => 0,
        'usedBy'    => [],
    ];

    /** Only active vouchers */
    public function scopeActive($query)
    {
        return $query->where('isActive', true);
    }

    /** Active + not expired + usage limit not hit */
    public function scopeUsable($query)
    {
        $now = now();
        return $query->where('isActive', true)
                     ->where(function ($q) use ($now) {
                         $q->whereNull('expiresAt')->orWhere('expiresAt', '>=', $now);
                     })
                     ->where(function ($q) {
                         $q->whereNull('maxUses')
                           ->orWhereRaw('{"$expr": {"$lt": ["$usedCount", "$maxUses"]}}');
                     });
    }
}

