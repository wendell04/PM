<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Banner extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'banners';

    protected $fillable = [
        'headline',
        'headlineAccent',
        'headlineAccentColor',
        'headlineAccent2',
        'headlineAccent2Color',
        'tag',
        'subtext',
        'ctaLabel',
        'ctaLink',
        'cta2Label',
        'cta2Link',
        'imagePosition',
        'image',
        'isVisible',
        'status',
        'order',
        'scheduleStart',
        'scheduleEnd',
        'showOn',
    ];

    protected $casts = [
        'isVisible' => 'boolean',
        'order' => 'integer',
    ];
}
