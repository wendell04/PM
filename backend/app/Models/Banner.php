<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Banner extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'banners';

    protected $fillable = [
        'name',
        'headline',
        'headlineAccent',
        'headlineAccentColor',
        'headlineAccent2',
        'headlineAccent2Color',
        'headlineBreak1',
        'headlineBreak2',
        'titleParts',
        'tag',
        'subtext',
        'ctaLabel',
        'ctaLink',
        'cta2Label',
        'cta2Link',
        'imagePosition',
        'imageScale',
        'imagePositionMobile',
        'imageScaleMobile',
        'imageFit',
        'image',
        'isVisible',
        'status',
        'order',
        'scheduleStart',
        'scheduleEnd',
        'showOn',
        'heroRole',
    ];

    protected $casts = [
        'isVisible' => 'boolean',
        'order' => 'integer',
    ];
}
