<?php

namespace App\Console\Commands;

use App\Models\RolePermission;
use Illuminate\Console\Command;

/**
 * php artisan rbac:seed-designer [--apply]
 *
 * The shop has had designers since before the software did. There was no role for them, so the
 * only way to let someone approve a proof was orders.edit - which also lets them cancel orders
 * and touch refunds. This adds the template; the permissions it grants already exist.
 *
 * Idempotent: re-running updates the template rather than duplicating it.
 */
class SeedDesignerRole extends Command
{
    protected $signature   = 'rbac:seed-designer {--apply : Write the role}';
    protected $description = 'Add the Designer role template';

    private const GRANTS = [
        'orders.view',      // they must see the order the design belongs to
        'design.view',
        'design.proof',
        'design.approve',
        'jobOrders.view',   // so they can see whether their design reached the bench
        'dashboard.view',
    ];

    public function handle(): int
    {
        $existing = RolePermission::where('role', 'designer')->first();
        $grid = [];
        foreach (self::GRANTS as $k) $grid[$k] = true;

        $this->line($existing ? 'Designer exists - it would be updated.' : 'Designer does not exist - it would be created.');
        foreach (self::GRANTS as $k) $this->line('  + ' . $k);

        if (!$this->option('apply')) {
            $this->line('Dry run. Re-run with --apply to write.');
            return self::SUCCESS;
        }

        if ($existing) {
            $existing->permissions = $grid;
            $existing->save();
            $this->info('Designer template updated.');
        } else {
            RolePermission::create(['role' => 'designer', 'permissions' => $grid]);
            $this->info('Designer template created.');
        }
        return self::SUCCESS;
    }
}
