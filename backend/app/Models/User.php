<?php

namespace App\Models;

use MongoDB\Laravel\Auth\User as Authenticatable;

class User extends Authenticatable
{

    protected $connection = 'mongodb';
    protected $collection = 'users';

    protected $fillable = [
        'firstName',
        'middleInitial',
        'lastName',
        'address',
        'phoneNumber',
        'email',
        'password',
        'is_verified',
        'api_token',
        'role',
        'verification_code',
        'verification_code_expires_at',
        'reset_token',
        'reset_token_expires_at',
        'lastLogin',
        'avatar',
    ];

    protected $hidden = ['password', 'remember_token', 'api_token', 'verification_code'];
}