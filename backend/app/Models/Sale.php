<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Sale extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'sales';

    protected $fillable = [
        'saleId',
        'inventoryId',
        'productName',
        'category',
        'quantity',
        'unitPrice',
        'totalPrice',
        'cost',
        'profit',
        'saleDate',
        'customerName',
        'customerContact',
        'customerEmail',
        'source',
        'status',
        'notes',
        'orderRequestId',
        'jobOrderId',
        'bomSnapshot',
        'createdAt',
    ];

    protected $casts = [
        'quantity'   => 'integer',
        'unitPrice'  => 'float',
        'totalPrice' => 'float',
        'cost'       => 'float',
        'profit'     => 'float',
        'saleDate'   => 'datetime',
        'createdAt'   => 'datetime',
        'bomSnapshot' => 'array',
    ];

    protected $attributes = [
        'quantity'   => 0,
        'unitPrice'  => 0,
        'totalPrice' => 0,
        'cost'       => 0,
        'profit'     => 0,
        'source'     => 'manual',
        'status'     => 'completed',
    ];

    public function inventory()
    {
        return $this->belongsTo(Inventory::class, 'inventoryId');
    }

    public function scopeBySource($query, $source)
    {
        return $query->where('source', $source);
    }

    public function scopeByStatus($query, $status)
    {
        return $query->where('status', $status);
    }

    public function scopeByDateRange($query, $startDate, $endDate)
    {
        return $query->whereBetween('saleDate', [$startDate, $endDate]);
    }

    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }
}
