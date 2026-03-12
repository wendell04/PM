<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class AuditLog extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'audit_logs';

    protected $fillable = [
        'inventoryId',
        'productName',
        'category',
        'reason',
        'quantity',
        'stockBefore',
        'stockAfter',
        'unitCost',
        'totalCost',
        'supplierId',
        'sellingPrice',
        'customerName',
        'saleDate',
        'remarks',
        'performedBy',
        'createdAt',
    ];

    protected $casts = [
        'quantity'     => 'integer',
        'stockBefore'  => 'integer',
        'stockAfter'   => 'integer',
        'unitCost'     => 'float',
        'totalCost'    => 'float',
        'sellingPrice' => 'float',
        'saleDate'     => 'datetime',
        'createdAt'    => 'datetime',
    ];

    protected $attributes = [
        'quantity'    => 0,
        'stockBefore' => 0,
        'stockAfter'  => 0,
    ];

    public function inventory()
    {
        return $this->belongsTo(Inventory::class, 'inventoryId');
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class, 'supplierId');
    }

    public function scopeByReason($query, $reason)
    {
        return $query->where('reason', $reason);
    }

    public function scopeByInventory($query, $inventoryId)
    {
        return $query->where('inventoryId', $inventoryId);
    }

    public function scopeStockIn($query)
    {
        return $query->where('quantity', '>', 0);
    }

    public function scopeStockOut($query)
    {
        return $query->where('quantity', '<', 0);
    }
}
