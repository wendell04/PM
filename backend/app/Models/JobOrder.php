<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class JobOrder extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'job_orders';

    protected $fillable = [
        'joId',
        'orderId',
        'product',
        'targetCompletion',
        'isRush',
        'joStatus',
        'assignedTo',
        'notes',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        'product'        => 'array',
        'targetCompletion' => 'datetime',
        'isRush'         => 'boolean',
        'createdAt'      => 'datetime',
        'updatedAt'      => 'datetime',
    ];

    protected $attributes = [
        'joStatus' => 'Queued',
        'isRush'   => false,
    ];

    public function order()
    {
        return $this->belongsTo(Order::class, 'orderId');
    }

    public function scopeByStatus($query, $status)
    {
        return $query->where('joStatus', $status);
    }

    public function scopeRush($query)
    {
        return $query->where('isRush', true);
    }

    public function scopeDueSoon($query, $days = 3)
    {
        $dueDate = now()->addDays($days);
        return $query->where('targetCompletion', '<=', $dueDate);
    }
}
