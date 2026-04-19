<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class InventoryReturn extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'returns';

    protected $fillable = [
        'returnId',
        // Legacy fields (kept for backwards compatibility / older records)
        'inventoryId',
        'inventoryName',
        'supplierId',
        'supplierName',
        'qty',
        'unitCost',
        'reason',
        // Current "Bad Orders" fields (supplier receiving issues)
        'materialId',
        'materialName',
        'vendorId',
        'vendorName',
        'batchId',
        'damageType',
        'quantity',
        'totalLoss',
        'status',
        'notes',
        'resolvedAt',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        'qty'        => 'integer',
        'quantity'   => 'integer',
        'unitCost'   => 'float',
        'totalLoss'  => 'float',
        'resolvedAt' => 'datetime',
        'createdAt'  => 'datetime',
        'updatedAt'  => 'datetime',
    ];

    protected $attributes = [
        'qty'       => 0,
        'quantity'  => 0,
        'unitCost'  => 0,
        'totalLoss' => 0,
        'status'    => 'pending',
        'notes'     => '',
    ];

    protected $indexes = [
        ['key' => ['status'      => 1]],
        ['key' => ['inventoryId' => 1]],
        ['key' => ['materialId'  => 1]],
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
