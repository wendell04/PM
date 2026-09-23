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
        // Who they were AT THE TIME. A staff member's role can change, and a record that resolves
        // the name and role by looking the account up today would quietly rewrite its own history.
        'performedByName',
        'performedByRole',
        // Where from. Without these an entry says a thing happened and nothing about whether the
        // person it names is who actually did it, which is the whole question a security log exists
        // to answer.
        'ip',
        'device',
        'metadata',
        'createdAt',
    ];

    /**
     * What a log entry can be. The label is what a person reads; the group is how the screen
     * files it. Anything not listed here still records - this decides how it READS, never
     * whether it is kept.
     */
    public const KINDS = [
        // Getting in, and failing to
        'login'              => ['Signed in',             'access'],
        'login_failed'       => ['Sign-in refused',       'access'],
        'login_locked'       => ['Account locked out',    'access'],
        'logout'             => ['Signed out',            'access'],
        'two_factor_passed'  => ['Passed 2FA',            'access'],
        'two_factor_failed'  => ['Failed 2FA',            'access'],
        'session_revoked'    => ['Signed a device out',   'access'],
        // The account itself
        'password_changed'   => ['Changed a password',    'account'],
        'password_reset'     => ['Reset a password',      'account'],
        'two_factor_enabled' => ['Turned 2FA on',         'account'],
        'two_factor_disabled'=> ['Turned 2FA off',        'account'],
        // Who is allowed to do what
        'staff_invited'      => ['Invited a staff member', 'people'],
        'staff_updated'      => ['Changed a staff member', 'people'],
        'staff_removed'      => ['Removed a staff member', 'people'],
        'permissions_changed'=> ['Changed permissions',    'people'],
        // Money and goods
        'order_status'       => ['Moved an order',        'orders'],
        'order_cancelled'    => ['Cancelled an order',    'orders'],
        'payment_recorded'   => ['Recorded a payment',    'money'],
        'refund'             => ['Refunded',              'money'],
        'price_changed'      => ['Changed a price',       'catalog'],
        'product_deleted'    => ['Deleted a product',     'catalog'],
        'stock_adjusted'     => ['Adjusted stock',        'stock'],
        'settings_changed'   => ['Changed a setting',     'settings'],
        // Reading things that are somebody else's business
        'viewed_audit_log'   => ['Opened the audit log',  'access'],
        'exported'           => ['Exported data',         'access'],
    ];

    public static function label(?string $action): string
    {
        return self::KINDS[$action][0] ?? ucfirst(str_replace('_', ' ', (string) $action));
    }

    public static function group(?string $action): string
    {
        return self::KINDS[$action][1] ?? 'other';
    }

    protected $casts = [
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
