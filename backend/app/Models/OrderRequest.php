<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class OrderRequest extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'order_requests';

    protected $fillable = [
        'customerId',
        'customerName',
        'customerEmail',
        'productId',
        'productName',
        'productThumbnail',
        'category',
        'priceType',
        'selectedVariants',
        'quantity',
        'designUrl',
        'designNotes',
        'designType',
        'designFee',
        'suggestedPrice',
        'finalPrice',
        'downPayment',
        'materials',
        'materialsCost',
        'paymentStatus',
        'deliveryAddress',
        'shippingFee',
        'convertedOrderId',
        'eta',
        'status',
        'statusHistory',
        'adminComment',
        'mockupUrl',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        'quantity'         => 'integer',
        'suggestedPrice'   => 'float',
        'finalPrice'       => 'float',
        'downPayment'      => 'float',
        'materials'        => 'array',
        'materialsCost'    => 'float',
        'deliveryAddress'  => 'array',
        'shippingFee'      => 'float',
        'designFee'        => 'float',
        'eta'              => 'datetime',
        'createdAt'        => 'datetime',
        'updatedAt'        => 'datetime',
    ];

    protected $attributes = [
        'status'           => 'pending_review',
        'statusHistory'    => [],
        'selectedVariants' => [],
        'paymentStatus'    => 'unpaid',
        'downPayment'      => null,
        'eta'              => null,
    ];

    // Scopes
    public function scopePending($query)
    {
        return $query->where('status', 'pending_review');
    }

    public function scopeByCustomer($query, $customerId)
    {
        return $query->where('customerId', $customerId);
    }
}
