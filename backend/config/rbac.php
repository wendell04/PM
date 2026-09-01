<?php

/**
 * Role-Based Access Control configuration.
 *
 * Single place that defines WHO holds system authority, who holds business
 * authority, and — critically — the Super Admin access toggle. All runtime
 * authorization decisions read from here via App\Support\Rbac.
 */
return [

    /*
    |--------------------------------------------------------------------------
    | Super Admin roles (system / developer authority)
    |--------------------------------------------------------------------------
    | Roles treated as system-level Super Admin. `admin` is the LEGACY key for
    | what is being renamed to `superAdmin`; both are recognized so the split
    | takes effect WITHOUT a forced data migration — existing `admin` accounts
    | keep working and are, from now on, Super Admins.
    */
    'super_admin_roles' => ['superAdmin', 'admin'],

    /*
    |--------------------------------------------------------------------------
    | Owner role (business authority)
    |--------------------------------------------------------------------------
    */
    'owner_role' => 'owner',

    /*
    |--------------------------------------------------------------------------
    | Super Admin access toggle   ← the switch you asked for
    |--------------------------------------------------------------------------
    | TRUE  (default, development): Super Admin BYPASSES every permission check
    |        and can reach every module. Needed while we build, debug and test.
    |
    | FALSE (scoped / production):  Super Admin is limited to its REAL job —
    |        system administration only (users, roles, audit logs, settings).
    |        Business modules then follow normal permission checks.
    |
    | Driven by env so it can never be flipped by an HTTP request — a security
    | bypass must not be toggleable from the browser. Flip it in .env, then run
    | `php artisan config:clear` (or config:cache) for it to take effect.
    */
    'super_admin_full_access' => (bool) env('SUPERADMIN_FULL_ACCESS', true),

    /*
    |--------------------------------------------------------------------------
    | Super Admin scope (used when full access is OFF)
    |--------------------------------------------------------------------------
    | The permission keys Super Admin keeps when NOT in full-access mode — its
    | actual system-administration responsibilities. Everything else is denied.
    */
    'super_admin_scope' => [
        'dashboard',
        'userManagement',
        'rolePermissions',
        'auditLogs',
        'systemSettings',
    ],

    /*
    |--------------------------------------------------------------------------
    | Business keys (Owner's unrestricted scope — reserved for the Owner-scoping
    | phase; Owner currently retains full access and is unchanged)
    |--------------------------------------------------------------------------
    */
    'business_keys' => [
        'dashboard',
        'orderRequests', 'orders', 'jobOrders', 'production', 'qc', 'pos',
        'inventory', 'vendors', 'badOrders',
        'sales', 'reports', 'payments',
        'products', 'banners', 'flashSales', 'vouchers',
        'userManagement',
    ],

    /*
    |--------------------------------------------------------------------------
    | Role ranks (privilege-escalation protection)
    |--------------------------------------------------------------------------
    | Higher rank = more authority. Used to enforce "you cannot assign a role at
    | or above your own level" and "you cannot manage an account that outranks
    | you". Legacy keys are ranked alongside their target-name equivalents so the
    | guard works before and after the role rename. Any provisioned staff role
    | not listed here falls back to `default_staff_rank`.
    */
    'default_staff_rank' => 10,
    'role_ranks' => [
        'superAdmin' => 100,
        'admin'      => 100,   // legacy key for Super Admin
        'owner'      => 90,
        'administrator' => 70,
        'manager'       => 50,
        // department staff — target names + current keys
        'financeStaff'      => 30,
        'salesStaff'        => 30,
        'productionStaff'   => 30,
        'inventoryStaff'    => 30,
        'salesRep'          => 30,
        'productionOperator'=> 30,
        'qualityControl'    => 30,
        'cashier'           => 30,
        'inventoryManager'  => 30,
        'customer'          => 0,
    ],

    /*
    |--------------------------------------------------------------------------
    | Action catalog (action-based permission model)
    |--------------------------------------------------------------------------
    | module => [actions]. Permission keys are `module.action` (e.g. orders.edit).
    | The engine (App\Support\Rbac::gridAllows) treats a module check as granted
    | if the coarse module flag is on OR any of its actions is on, and an action
    | check as granted by an explicit action key, falling back to the coarse
    | module flag only when the role defines no actions for that module (legacy).
    */
    'action_catalog' => [
        'dashboard'       => ['view'],
        'orderRequests'   => ['view', 'create', 'edit', 'delete', 'approve'],
        'orders'          => ['view', 'create', 'edit', 'delete', 'updateStatus'],
        'jobOrders'       => ['view', 'create', 'edit', 'delete', 'updateStatus'],
        'pos'             => ['view', 'sell', 'void'],
        'inventory'       => ['view', 'create', 'edit', 'delete'],
        'vendors'         => ['view', 'create', 'edit', 'delete'],
        'badOrders'       => ['view', 'create', 'edit', 'delete'],
        'sales'           => ['view', 'export'],
        'reports'         => ['view', 'export'],
        'products'        => ['view', 'create', 'edit', 'delete'],
        'banners'         => ['view', 'create', 'edit', 'delete'],
        'flashSales'      => ['view', 'create', 'edit', 'delete'],
        'vouchers'        => ['view', 'create', 'edit', 'delete'],
        'payments'        => ['view', 'create', 'edit', 'delete', 'confirm', 'refund'],
        'auditLogs'       => ['view'],
        'userManagement'  => ['view', 'create', 'edit', 'disable', 'delete', 'assignRole'],
        'rolePermissions' => ['view', 'create', 'edit', 'delete', 'assignPermissions'],
    ],

    /*
    |--------------------------------------------------------------------------
    | Role templates (seeded by `php artisan rbac:sync-roles`)
    |--------------------------------------------------------------------------
    | grants: module => 'full' (all actions) | 'view' (view only) | [actions] |
    | 'none' (omitted modules default to none). superAdmin/owner are protected
    | and NOT seeded here — they bypass via App\Support\Rbac.
    */
    'role_templates' => [
        'administrator' => [
            'label'  => 'Administrator',
            'grants' => [
                'dashboard' => 'view',
                'orderRequests' => 'full', 'orders' => 'full', 'jobOrders' => 'full', 'pos' => 'full',
                'inventory' => 'full', 'vendors' => 'full', 'badOrders' => 'full',
                'sales' => 'full', 'reports' => 'full', 'payments' => 'full',
                'products' => 'full', 'banners' => 'full', 'flashSales' => 'full', 'vouchers' => 'full',
                'userManagement' => 'full',
            ],
        ],
        'manager' => [
            'label'  => 'Manager',
            'grants' => [
                'dashboard' => 'view',
                'orderRequests' => 'full', 'orders' => 'full', 'jobOrders' => 'full',
                'inventory' => 'full', 'badOrders' => 'full',
                'sales' => 'full', 'reports' => 'full',
                'products' => 'view', 'banners' => 'view', 'flashSales' => 'view', 'vouchers' => 'view',
            ],
        ],
        'salesStaff' => [
            'label'  => 'Sales Staff',
            'grants' => [
                'dashboard' => 'view',
                'orderRequests' => 'full', 'orders' => 'full', 'pos' => 'full',
                'sales' => 'view', 'vouchers' => 'view',
            ],
        ],
        'productionStaff' => [
            'label'  => 'Production Staff',
            'grants' => [
                'dashboard' => 'view',
                'orders' => ['view', 'updateStatus'],
                'jobOrders' => 'full', 'badOrders' => 'full',
                'inventory' => 'view',
            ],
        ],
        'inventoryStaff' => [
            'label'  => 'Inventory Staff',
            'grants' => [
                'dashboard' => 'view',
                'inventory' => 'full', 'vendors' => 'full', 'badOrders' => 'full',
            ],
        ],
        'financeStaff' => [
            'label'  => 'Finance Staff',
            'grants' => [
                'dashboard' => 'view',
                'payments' => 'full', 'sales' => 'full', 'reports' => 'full',
                'orders' => 'view',
            ],
        ],
    ],
];
