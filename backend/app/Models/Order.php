<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Order extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'orders';

    protected $fillable = [
        'userId',
        'userSnapshot',   
        'items',          
        'totalAmount',
        'status',         
        'paymentMethod',  
        'paymentStatus',  
        'notes',
    ];

    protected $casts = [
        'items'        => 'array',
        'userSnapshot' => 'array',
        'totalAmount'  => 'float',
    ];

    protected $attributes = [
        'status'        => 'pending',
        'paymentMethod' => null,
        'paymentStatus' => 'unpaid',
        'notes'         => '',
    ];
}