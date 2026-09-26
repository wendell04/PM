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
        'audit.exported'        => ['Exported the audit log', 'access'],
        'audit.purged'          => ['Purged audit entries',   'access'],

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
        'pos.sale'            => ['Rang up a walk-in sale', 'money'],
        'payment.recorded'    => ['Recorded a payment by hand', 'money'],
        'payment.paid'        => ['Payment came in',     'money'],
        'payment.voided'      => ['Voided a payment',    'money'],
        'order.refund_waived' => ['Waived a refund',     'money'],
        'order.refunded'      => ['Marked a refund sent', 'money'],
        'order.written_off'   => ['Wrote off an order',  'money'],

        // Material moved by hand - the way stock disappears without a sale
        'stock.adjusted'      => ['Adjusted stock',      'stock'],

        // The catalogue and the shop's own rules
        'product_publish_toggled' => ['Published or hid a product', 'catalog'],
        'review_submitted'        => ['A customer left a review',    'catalog'],
        'settings.changed'        => ['Changed a setting',          'settings'],
        'settings.terms_changed'  => ['Changed the terms',          'settings'],
    ];

    /**
     * Append-only, enforced here rather than hoped for.
     *
     * An audit log that the application can edit is not evidence of anything: the first thing
     * somebody covering their tracks does is change or remove the line about themselves. Nothing
     * in this system has ever had a reason to modify an entry, so an update is always a mistake
     * or an attack and is refused outright.
     *
     * Deletion is refused too, with one narrow way through. The test-data reset genuinely needs
     * it, and silently breaking a tool the owner uses is worse than the risk - so it has to say
     * so out loud, by name, and the purge records itself before it runs. Nothing else can.
     *
     * This does not stop somebody with direct database access. That is a different threat, and
     * the answer to it is Atlas permissions, not PHP.
     */
    // A stack, not a single reason. With one slot, a purge nested inside another would shut the
    // door on its way out and the outer one's remaining deletes would start failing - a trap for
    // whoever writes the second caller. Nothing nests today; this is so nothing has to remember.
    private static array $purgeReasons = [];

    /** Open the one door, for the length of one callback, with a reason that gets recorded. */
    public static function purging(string $reason, callable $work)
    {
        self::$purgeReasons[] = $reason;
        try {
            return $work();
        } finally {
            array_pop(self::$purgeReasons);
        }
    }

    protected static function booted(): void
    {
        static::updating(function () {
            throw new \RuntimeException(
                'An audit log entry cannot be changed. If this is a new kind of event, write a new entry.'
            );
        });

        static::deleting(function () {
            if (self::$purgeReasons === []) {
                throw new \RuntimeException(
                    'An audit log entry cannot be deleted. ActivityLog::purging() is the only way, and it '
                    . 'has to name a reason.'
                );
            }
        });
    }

    /**
     * Getting in, and being turned away.
     *
     * Named here rather than typed into the summary, because that is exactly how they went
     * stale: the actions were renamed to the dotted convention, every writer moved with them,
     * and the summary was left filtering on 'login'. It counted zero sign-ins on a screen that
     * was listing sign-ins immediately underneath.
     */
    public const SIGN_IN = ['auth.login'];

    public const REFUSED = ['auth.login_failed', 'auth.login_locked', 'auth.2fa_failed'];

    /**
     * Records audited automatically (Concerns\Auditable) write "<entity>.created|updated|deleted".
     * Their words and group come from here rather than one KINDS line per entity and event.
     */
    public const ENTITIES = [
        'material' => ['a material', 'stock'],   'bom' => ['a BOM', 'stock'],
        'supplier' => ['a supplier', 'stock'],   'unit' => ['a unit', 'stock'],
        'product' => ['a product', 'catalog'],   'collection' => ['a collection', 'catalog'],
        'banner' => ['a banner', 'catalog'],     'voucher' => ['a voucher', 'money'],
        'flash_sale' => ['a flash sale', 'money'], 'review' => ['a review', 'catalog'],
        'job_order' => ['a job order', 'orders'], 'quotation' => ['a quotation', 'orders'],
        'order_form' => ['an order form', 'settings'], 'page_content' => ['page content', 'catalog'],
        'bad_order' => ['a bad order', 'stock'],
    ];

    private static function entityKind(?string $action): ?array
    {
        if (!is_string($action) || !preg_match('/^([a-z_]+)\.(created|updated|deleted)$/', $action, $m)) return null;
        if (!isset(self::ENTITIES[$m[1]])) return null;
        [$noun, $group] = self::ENTITIES[$m[1]];
        return [['created' => 'Created ', 'updated' => 'Changed ', 'deleted' => 'Deleted '][$m[2]] . $noun, $group];
    }

    public static function label(?string $action): string
    {
        return self::KINDS[$action][0] ?? self::entityKind($action)[0] ?? ucfirst(str_replace('_', ' ', (string) $action));
    }

    public static function group(?string $action): string
    {
        return self::KINDS[$action][1] ?? self::entityKind($action)[1] ?? 'other';
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
