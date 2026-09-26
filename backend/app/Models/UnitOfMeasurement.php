<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class UnitOfMeasurement extends Model
{
    // Every create, change and delete by a signed-in person lands in the audit trail.
    use \App\Models\Concerns\Auditable;
    protected string $auditEntity = 'unit';

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
