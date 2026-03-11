<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Product extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'products';

    protected $fillable = [
        'name',
        'description',
        'category',
        'tags',
        'images',
        'variants',
        'priceTiers',
        'flatPrice',
        'isActive',
    ];

    protected $casts = [
        'tags'      => 'array',
        'images'    => 'array',
        'variants'  => 'array',
        'priceTiers'=> 'array',
        'flatPrice' => 'float',
        'isActive'  => 'boolean',
    ];

    protected $attributes = [
        'isActive' => true,
        'tags'     => '[]',
        'images'   => '[]',
        'variants' => '[]',
        'priceTiers'=> '[]',
    ];
}