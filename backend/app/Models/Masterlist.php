<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Masterlist extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'masterlist';

    protected $fillable = [
        'categories',
        'updatedAt',
    ];

    protected $casts = [
        'categories' => 'array',
        'updatedAt'  => 'datetime',
    ];

    protected $attributes = [
        'categories' => [],
    ];
}
