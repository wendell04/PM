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
        // Sales recorded by hand or imported (ManualSaleController). The spreadsheet's own column
        // names are kept beside the app's, the same as the 2023-2025 history, so every reader agrees.
        'salesChannel',
        'pricePerUnit',
        'costPerUnit',
        'totalCost',
        'importBatch',
        'recordedById',
        'recordedByName',
    ];

    // Sent on every sale, so an imported line (no `cost` field of its own) still shows its cost.
    protected $appends = ['cost'];

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

    /**
     * What the goods on this line cost. The imported sales history (2023-2025, from the owner's
     * spreadsheet) carries it as totalCost / costPerUnit, the spreadsheet's own columns, not as
     * `cost` - reading only `cost` showed every one of those 344 lines as "no cost" and all profit.
     */
    /** `cost` as every screen reads it, filled from the spreadsheet's columns on imported lines. */
    public function getCostAttribute($value): float
    {
        // Serialising an appended attribute passes no value, so read the stored one.
        $v = (float) ($this->attributes['cost'] ?? $value ?? 0);
        if ($v > 0) return $v;
        $tc = (float) ($this->attributes['totalCost'] ?? 0);
        if ($tc > 0) return $tc;
        return (float) ($this->attributes['costPerUnit'] ?? 0) * (float) ($this->attributes['quantity'] ?? 0);
    }

    public static function costOf($s): float
    {
        $cost = (float) ($s->cost ?? 0);
        if ($cost > 0) return $cost;
        if ((float) ($s->totalCost ?? 0) > 0) return (float) $s->totalCost;
        return (float) ($s->costPerUnit ?? 0) * (float) ($s->quantity ?? 0);
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
