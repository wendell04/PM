<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class StockHistory extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'stock_history';

    protected $fillable = [
        'inventoryId',
        'supplierId',
        'supplierName',
        'quantity',
        'remainingQty',
        'unitCost',
        'totalCost',
        'reason',
        'batchId',
        'invoiceNumber',
        'deliveryDate',
        'orderedAt',      // when the order was placed with the supplier
        'leadTimeDays',   // deliveryDate - orderedAt, one observed lead time
        'sellingPrice',
        'saleDate',
        'customerName',
        'remarks',
        'type',
        'performedBy',
        'orderId',
        'productId',
        'productName',
        'customerName',
        // The job order a production write-off belongs to. Written by QC scrap, spoilage and the
        // cancelled-job settle for a long time before it was listed here, so it was dropped.
        'reference',
        'createdAt',
    ];

    protected $casts = [
        'quantity'     => 'integer',
        'remainingQty' => 'integer',
        'unitCost'     => 'float',
        'totalCost'    => 'float',
        'sellingPrice' => 'float',
        'createdAt'    => 'datetime',
        'deliveryDate' => 'datetime',
        'saleDate'     => 'datetime',
        'type'         => 'string',
    ];

    protected $attributes = [
        'remainingQty' => 0,
        'type'         => 'addition',
    ];

    public function inventory()
    {
        return $this->belongsTo(Inventory::class, 'inventoryId');
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class, 'supplierId');
    }
}
