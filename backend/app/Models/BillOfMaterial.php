<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;
use MongoDB\Laravel\Eloquent\Casts\ObjectId;

class BillOfMaterial extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'bill_of_materials';

    protected $fillable = [
        'sku',
        'productName',
        'productGroupName',
        'variantName',
        'variantCombo',
        'components',
        'totalCost',
        'isActive',
        'createdAt',
        'updatedAt',
    ];

    // components shape:
    // [{ inventoryId: ObjectId, materialName: string, qty: float, unit: string, unitCost: float }]

    protected $casts = [
        'variantCombo' => 'array',
        'components'   => 'array',
        'totalCost'    => 'float',
        'isActive'     => 'boolean',
        'createdAt'    => 'datetime',
        'updatedAt'    => 'datetime',
    ];

    protected $indexes = [
        ['key' => ['productGroupName' => 1]],
        ['key' => ['sku'              => 1], 'unique' => true],
        ['key' => ['isActive'         => 1]],
    ];

    protected $attributes = [
        'isActive'   => true,
        'totalCost'  => 0,
        'components' => [],
    ];

    public function scopeActive($query)
    {
        return $query->where('isActive', true);
    }

    public function scopeByProductGroup($query, string $group)
    {
        return $query->where('productGroupName', $group);
    }
}
