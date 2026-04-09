<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Banner extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'banners';

    protected $fillable = [
        'headline',
        'subtext',
        'ctaLabel',
        'ctaLink',
        'image',
        'isVisible',
        'status',
        'order',
        'scheduleStart',
        'scheduleEnd',
    ];

    protected $casts = [
        'isVisible' => 'boolean',
        'order' => 'integer',
    ];
}
