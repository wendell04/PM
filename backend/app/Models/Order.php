<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Order extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'orders';

    protected $guarded = [];

    protected $casts = [
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
        'designStatus'             => 'string',
        'adminDesignUrl'           => 'string',
        'revisionNotes'            => 'string',
        'createdAt'            => 'datetime',
        'updatedAt'            => 'datetime',
        'orderSource'          => 'string',
        'voucherCode'          => 'string',
        'discountAmount'       => 'float',
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
        'paymentHistory'     => [],
        'statusHistory'      => [],
        'orderSource'        => 'online',
    ];

    public function getItemsAttribute($value)
    {
        if (is_string($value)) return json_decode($value, true) ?? [];
        return is_array($value) ? $value : [];
    }

    public function getUserSnapshotAttribute($value)
    {
        if (is_string($value)) return json_decode($value, true) ?? [];
        return is_array($value) ? $value : [];
    }

    public function getDeliveryAddressAttribute($value)
    {
        if (is_string($value)) return json_decode($value, true) ?? null;
        return $value;
    }

    public function getPaymentHistoryAttribute($value)
    {
        if (is_string($value)) return json_decode($value, true) ?? [];
        return is_array($value) ? $value : [];
    }

    public function getStatusHistoryAttribute($value)
    {
        if (is_string($value)) return json_decode($value, true) ?? [];
        return is_array($value) ? $value : [];
    }

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
