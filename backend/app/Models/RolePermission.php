<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class RolePermission extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'role_permissions';

    protected $fillable = [
        'role',
        'label',
        'permissions',
        'updatedBy',
        'updatedAt',
    ];

    protected $casts = [
        'permissions' => 'array',
        'updatedAt'   => 'datetime',
    ];

    /**
     * Default permission set for a role.
     * All sections default to false (no access).
     */
    public static function defaultPermissions(): array
    {
        return [
            'dashboard'       => true,  // All staff see dashboard overview
            'orderRequests'   => false,
            'orders'            => false,
            'jobOrders'         => false,
            'pos'               => false,
            'inventory'         => false,
            'vendors'           => false,
            'badOrders'         => false,
            'sales'             => false,
            'reports'           => false,
            'products'          => false,
            'banners'           => false,
            'flashSales'        => false,
            'vouchers'          => false,
            'auditLogs'         => false,
            'userManagement'    => false,
            'rolePermissions'   => false,
        ];
    }

    /**
     * Get permissions for a role, creating defaults if not found.
     */
    public static function forRole(string $role): array
    {
        $record = static::where('role', $role)->first();
        if (!$record) {
            return static::defaultPermissions();
        }
        // Merge with defaults to handle new permissions added later
        return array_merge(static::defaultPermissions(), $record->permissions ?? []);
    }
}
