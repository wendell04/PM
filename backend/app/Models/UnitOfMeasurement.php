<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class UnitOfMeasurement extends Model
{
    protected $connection = 'mongodb';

    protected $collection = 'units';

    protected $fillable = [
        'name',
        'abbreviation',
        'isActive',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        'isActive' => 'boolean',
    ];

    protected $attributes = [
        'isActive' => true,
    ];
}
