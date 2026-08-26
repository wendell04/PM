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
        'itemIndex',
        'product',
        'targetCompletion',
        'isRush',
        'joStatus',
        'assignedTo',
        'notes',
        'designNotes',
        'designFilePath',
        'designFilePaths',
        'productionFiles',
        'spoilage',
        'materialsPulled',
        'adminComment',
        'qcResult',
        'qcHistory',
        'acceptedQty',
        'materialsConsumed',
        'bomSnapshot',
        'bomVerified',
        'cancelledAt',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        // FlexibleArray, not 'array': these fields exist in the collection both as native Mongo arrays
        // and as JSON strings, and the built-in cast throws on the former. See the cast for detail.
        'product'           => \App\Casts\FlexibleArray::class,
        'targetCompletion'  => 'datetime',
        'isRush'            => 'boolean',
        'designFilePaths'   => \App\Casts\FlexibleArray::class,
        'productionFiles'   => \App\Casts\FlexibleArray::class,
        'spoilage'          => \App\Casts\FlexibleArray::class,
        'materialsPulled'   => \App\Casts\FlexibleArray::class,
        'qcResult'          => \App\Casts\FlexibleArray::class,
        'qcHistory'         => \App\Casts\FlexibleArray::class,
        'materialsConsumed' => \App\Casts\FlexibleArray::class,
        'bomSnapshot'       => \App\Casts\FlexibleArray::class,
        'bomVerified'       => 'boolean',
        'cancelledAt'       => 'datetime',
        'createdAt'         => 'datetime',
        'updatedAt'         => 'datetime',
    ];

    protected $attributes = [
        'joStatus'          => 'Queued',
        'isRush'            => false,
        'bomVerified'       => false,
        // Default values for 'array'-cast attributes must be the ENCODED form. A raw PHP [] here
        // reaches the cast as an array, json_decode() rejects it, and serialising the model throws -
        // which took down the entire job order list with "Failed to fetch job orders" for every
        // document created without an explicit materialsConsumed.
        'materialsConsumed' => '[]',
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
