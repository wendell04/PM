<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Collection extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'collections';

    protected $fillable = [
        'title',
        'slug',
        'description',
        'image',
        'type',
        'conditionMatch',
        'conditions',
        'productIds',
        'isPublished',
        'sortOrder',
    ];

    protected $casts = [
        'isPublished' => 'boolean',
        'sortOrder'   => 'integer',
    ];

    protected $attributes = [
        'type'           => 'manual',
        'conditionMatch' => 'all',
        'isPublished'    => false,
        'sortOrder'      => 0,
    ];
}
