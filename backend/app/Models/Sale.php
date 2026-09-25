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
        'productId',
        'variantId',
        'variantName',
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
        // Written by completeOrder and the counter since the discounts work, and silently dropped by
        // this list the whole time - so no sale row ever said what came off it.
        'discount',
        'voucherCode',
        // The order a line belongs to, so a report counts orders rather than lines.
        'orderRef',
        // Set by sales:backfill-cost on a row whose cost was filled in afterwards.
        'costBackfilledAt',
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
