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
        'landing_order',
        'landing_image_position',
    ];

    protected $casts = [
        'isPublished'   => 'boolean',
        'sortOrder'     => 'integer',
        'landing_order' => 'integer',
    ];

    protected $attributes = [
        'type'           => 'manual',
        'conditionMatch' => 'all',
        'isPublished'    => false,
        'sortOrder'      => 0,
    ];
}
