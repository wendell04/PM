<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model as MongoModel;

class OtpCode extends MongoModel
{
    protected $connection = 'mongodb';
    protected $collection = 'otp_codes';

    protected $fillable = [
        'user_id',
        'code_hash',
        'expires_at',
        'attempts',
        'used',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'attempts'   => 'integer',
        'used'       => 'boolean',
    ];
}
