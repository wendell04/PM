<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class InventoryReturn extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'returns';

    protected $fillable = [
        'returnId',
        'inventoryId',
        'inventoryName',
        'supplierId',
        'supplierName',
        'qty',
        'unitCost',
        'reason',
        'status',
        'notes',
        'resolvedAt',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        'qty'        => 'integer',
        'unitCost'   => 'float',
        'resolvedAt' => 'datetime',
        'createdAt'  => 'datetime',
        'updatedAt'  => 'datetime',
    ];

    protected $attributes = [
        'qty'      => 0,
        'unitCost' => 0,
        'status'   => 'pending',
        'notes'    => '',
    ];

    protected $indexes = [
        ['key' => ['status'      => 1]],
        ['key' => ['inventoryId' => 1]],
        ['key' => ['createdAt'   => -1]],
    ];

    public function inventory()
    {
        return $this->belongsTo(Inventory::class, 'inventoryId');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }
}
