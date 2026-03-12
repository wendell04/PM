<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Order extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'orders';

    protected $fillable = [
        'orderId',
        'userId',
        'userSnapshot',
        'customerName',
        'customerContact',
        'customerEmail',
        'product',
        'quantity',
        'totalPrice',
        'downPayment',
        'balance',
        'orderStatus',
        'joStatus',
        'isRush',
        'targetCompletion',
        'paymentDate',
        'designFile',
        'designNotes',
        'checkoutRestricted',
        'joId',
        'items',
        'totalAmount',
        'status',
        'paymentMethod',
        'paymentStatus',
        'notes',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        'items'        => 'array',
        'userSnapshot' => 'array',
        'product'      => 'array',
        'totalAmount'  => 'float',
        'totalPrice'   => 'float',
        'downPayment'  => 'float',
        'balance'      => 'float',
        'isRush'       => 'boolean',
        'checkoutRestricted' => 'boolean',
        'targetCompletion' => 'datetime',
        'paymentDate'  => 'datetime',
        'createdAt'    => 'datetime',
        'updatedAt'    => 'datetime',
    ];

    protected $attributes = [
        'orderStatus'        => 'Pending',
        'joStatus'           => null,
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