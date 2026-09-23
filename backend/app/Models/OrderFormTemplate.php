<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

/**
 * One order form the shop can send: a name, the description block shown above the questions, and
 * the questions themselves. A sent form carries a copy of this, so editing a template never
 * changes a form somebody has already been asked to fill in.
 */
class OrderFormTemplate extends Model
{
    protected $connection = 'mongodb';

    protected $collection = 'order_form_templates';

    // camelCase timestamps, to match the documents every other collection here writes.
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'name',
        'description',
        'questions',
        'isDefault',
        'createdBy',
        'updatedBy',
    ];

    protected $casts = [
        'questions' => 'array',
        'isDefault' => 'boolean',
    ];

    protected $attributes = [
        'isDefault' => false,
    ];
}
