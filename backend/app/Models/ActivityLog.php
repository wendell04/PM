<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class ActivityLog extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'activity_logs';

    protected $fillable = [
        'action',
        'entityType',
        'entityId',
        'description',
        'performedBy',
        'performedByEmail',
        'metadata',
        'createdAt',
    ];

    protected $casts = [
        'metadata'  => 'array',
        'createdAt' => 'datetime',
    ];

    public $timestamps = false;

    public function scopeByAction($query, $action)
    {
        return $query->where('action', $action);
    }

    public function scopeByEntity($query, $entityType, $entityId = null)
    {
        $query->where('entityType', $entityType);
        if ($entityId) $query->where('entityId', $entityId);
        return $query;
    }
}
