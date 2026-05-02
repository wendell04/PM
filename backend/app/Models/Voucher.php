<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Voucher extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'vouchers';

    // Use camelCase timestamps to match existing documents
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'code',
        'benefitCategory',   // monetary | product | service | production | loyalty | experiential
        'benefitType',       // specific type within category
        'benefitDescription',// manual description for non-monetary benefits
        'discountType',      // percentage | fixed  (only for monetary)
        'discountValue',     // numeric              (only for monetary)
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
    ];

    protected $attributes = [
        'isActive'       => true,
        'usedCount'      => 0,
        'benefitCategory'=> 'monetary',
    ];

    // Only active vouchers
    public function scopeActive($query)
    {
        return $query->where('isActive', true);
    }

    // Active + not expired + usage limit not hit
    public function scopeUsable($query)
    {
        $now = now();
        return $query->where('isActive', true)
                     ->where(function ($q) use ($now) {
                         $q->whereNull('expiresAt')->orWhere('expiresAt', '>=', $now);
                     })
                     ->where(function ($q) {
                         $q->whereNull('maxUses')
                           ->orWhereColumn('usedCount', '<', 'maxUses');
                     });
    }

    /** Returns true if this voucher applies an automatic monetary discount */
    public function isMonetary(): bool
    {
        return ($this->benefitCategory ?? 'monetary') === 'monetary';
    }
}
