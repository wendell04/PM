<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Order extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'orders';

    protected $guarded = [];

    protected $casts = [
        'items'              => 'array',
        'userSnapshot'       => 'array',
        'deliveryAddress'    => 'array',
        'isRush'             => 'boolean',
        'checkoutRestricted' => 'boolean',
        'downPayment'        => 'float',
        'balance'            => 'float',
        'shippingFee'        => 'float',
        'totalAmount'        => 'float',
        'targetCompletion'   => 'datetime',
        'paymentDate'          => 'datetime',
        'designNotes'          => 'string',
        'designFilePath'       => 'string',
        'paymentMethod'        => 'string',
        'paymongoPaymentId'    => 'string',
        'paymongoReferenceNumber' => 'string',
        'createdAt'            => 'datetime',
        'updatedAt'            => 'datetime',
    ];

    protected $indexes = [
        ['key' => ['userId'      => 1]],
        ['key' => ['orderStatus' => 1]],
        ['key' => ['createdAt'   => -1]],
        ['key' => ['userId' => 1, 'createdAt' => -1]],
    ];

    protected $attributes = [
        'orderStatus'        => 'Pending',
        'paymentStatus'      => 'unpaid',
        'isRush'             => false,
        'checkoutRestricted' => true,
        'downPayment'        => 0,
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'userId');
    }

    public function jobOrder()
    {
        return $this->hasOne(JobOrder::class, 'orderId');
    }

    public function scopeByStatus($query, $status)
    {
        return $query->where('orderStatus', $status);
    }

    public function scopeWithJobOrder($query)
    {
        return $query->whereNotNull('joId');
    }

    public function scopeRush($query)
    {
        return $query->where('isRush', true);
    }

    public function scopePending($query)
    {
        return $query->where('orderStatus', 'Pending');
    }

    public function scopeInProduction($query)
    {
        return $query->where('orderStatus', 'In Production');
    }
}
