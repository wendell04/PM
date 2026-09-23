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
     * Every action name this system actually writes, with the words a person reads and the
     * group the screen files it under.
     *
     * Two naming conventions live here, and deliberately so. The dotted ones are the convention
     * going forward; the flat ones (order_status_changed, payment_received, the design_* set)
     * were already being written before this list existed and are left exactly as they are -
     * renaming them would orphan every row already in the database, which for an audit log is
     * the one thing you must never do.
     *
     * An action missing from this list still records. It just reads as its own raw name and
     * files under "other", which is how you notice a new event was added and never listed.
     */
    public const KINDS = [
        // Getting in, and failing to
        'auth.login'            => ['Signed in',              'access'],
        'auth.login_failed'     => ['Sign-in refused',        'access'],
        'auth.login_locked'     => ['Account locked out',     'access'],
        'auth.logout'           => ['Signed out',             'access'],
        'auth.2fa_passed'       => ['Passed 2FA',             'access'],
        'auth.2fa_failed'       => ['Failed 2FA',             'access'],
        'auth.password_reset'   => ['Reset a password',       'access'],
        'auth.password_changed' => ['Changed their password', 'access'],
        'auth.2fa_enabled'      => ['Turned 2FA on',          'access'],
        'auth.2fa_disabled'     => ['Turned 2FA off',         'access'],
        'auth.session_revoked'  => ['Signed a device out',    'access'],
        'audit.viewed'          => ['Opened the audit log',   'access'],

        // Who is allowed to do what
        'user.created'             => ['Added a staff member',    'people'],
        'user.owner_created'       => ['Created the Owner',       'people'],
        'user.updated'             => ['Changed an account',      'people'],
        'user.role_changed'        => ['Changed a role',          'people'],
        'user.deleted'             => ['Deleted an account',      'people'],
        'user.unlocked'            => ['Unlocked an account',     'people'],
        'role.created'             => ['Created a role',          'people'],
        'role.deleted'             => ['Deleted a role',          'people'],
        'role.permissions_changed' => ['Changed permissions',     'people'],

        // Orders and the work behind them
        'order_status_changed'                => ['Moved an order',            'orders'],
        'order_cancelled_by_customer'         => ['Customer cancelled',        'orders'],
        'order_request_cancelled_by_customer' => ['Customer cancelled a quote', 'orders'],
        'job_order_deleted'                   => ['Deleted a job order',       'orders'],
        'design_approved'                     => ['Approved a design',         'orders'],
        'design_rejected'                     => ['Rejected a design',         'orders'],
        'design_draft_uploaded'               => ['Sent a proof',              'orders'],
        'design_resubmitted'                  => ['Customer re-sent a design', 'orders'],
        'design_approval_reverted'            => ['Reopened an approval',      'orders'],

        // Money
        'payment_received'    => ['Recorded a payment',  'money'],
        'order.refund_waived' => ['Waived a refund',     'money'],

        // The catalogue and the shop's own rules
        'product_publish_toggled' => ['Published or hid a product', 'catalog'],
        'review_submitted'        => ['A customer left a review',    'catalog'],
        'settings.changed'        => ['Changed a setting',          'settings'],
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
