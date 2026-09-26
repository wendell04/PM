<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Banner extends Model
{
    // Every create, change and delete by a signed-in person lands in the audit trail.
    use \App\Models\Concerns\Auditable;
    protected string $auditEntity = 'banner';

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
        'durationSeconds',
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
