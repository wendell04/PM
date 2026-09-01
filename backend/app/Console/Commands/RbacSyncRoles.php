<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use App\Models\RolePermission;
use App\Models\User;

/**
 * Seeds / expands staff roles to the action-based permission model defined in
 * config('rbac.role_templates'). Idempotent and safe to re-run.
 *
 *   php artisan rbac:sync-roles --dry-run   # preview, writes nothing
 *   php artisan rbac:sync-roles             # additive: create missing roles,
 *                                           # add missing keys, preserve existing values
 *   php artisan rbac:sync-roles --force     # overwrite each role fully from template
 */
class RbacSyncRoles extends Command
{
    protected $signature = 'rbac:sync-roles {--dry-run : Preview changes without writing} {--force : Overwrite existing roles fully from their template}';
    protected $description = 'Seed/expand staff roles to the action-based permission model (config/rbac.php).';

    public function handle(): int
    {
        $dry   = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');
        $templates = config('rbac.role_templates', []);

        if (empty($templates)) {
            $this->error('No role templates configured in config/rbac.php.');
            return self::FAILURE;
        }

        $this->info(($dry ? '[DRY RUN] ' : '') . 'Syncing ' . count($templates) . ' role template(s)…');
        $this->newLine();

        $rows = [];
        foreach ($templates as $role => $tpl) {
            $target   = $this->buildPerms($tpl['grants'] ?? []);
            $label    = $tpl['label'] ?? ucfirst($role);
            $existing = RolePermission::where('role', $role)->first();

            if (!$existing) {
                $action = 'CREATE';
                $final  = $target;
            } elseif ($force) {
                $action = 'OVERWRITE';
                $final  = $target;
            } else {
                // Additive: keep existing values, add only missing keys.
                $current = $existing->permissions ?? [];
                $final   = $current;
                $added   = 0;
                foreach ($target as $k => $v) {
                    if (!array_key_exists($k, $current)) { $final[$k] = $v; $added++; }
                }
                $action = $added > 0 ? "ADD +{$added}" : 'UNCHANGED';
            }

            $users = User::where('role', $role)->count();
            $rows[] = [$role, $label, $action, count($final) . ' keys', $users];

            if (!$dry && $action !== 'UNCHANGED') {
                RolePermission::updateOrCreate(
                    ['role' => $role],
                    ['label' => $label, 'permissions' => $final, 'updatedBy' => 'rbac:sync-roles', 'updatedAt' => now()]
                );
                foreach (User::where('role', $role)->pluck('_id') as $uid) {
                    Cache::forget("admin_permissions_{$uid}");
                }
            }
        }

        $this->table(['Role', 'Label', 'Action', 'Keys', 'Users'], $rows);

        if ($dry) {
            $this->newLine();
            $this->warn('Dry run — nothing was written. Re-run without --dry-run to apply.');
        } else {
            $this->newLine();
            $this->info('Done. Per-user permission caches cleared for affected roles.');
        }
        return self::SUCCESS;
    }

    /** Build a flat {module: bool, "module.action": bool} grid from a grants spec. */
    private function buildPerms(array $grants): array
    {
        $catalog = config('rbac.action_catalog', []);
        $perms   = [];
        foreach ($catalog as $module => $actions) {
            $spec = $grants[$module] ?? 'none';
            if ($spec === 'full') {
                $perms[$module] = true;
                foreach ($actions as $a) $perms["{$module}.{$a}"] = true;
            } elseif ($spec === 'view') {
                $perms[$module] = true;
                foreach ($actions as $a) $perms["{$module}.{$a}"] = ($a === 'view');
            } elseif (is_array($spec)) {
                $perms[$module] = true;
                foreach ($actions as $a) $perms["{$module}.{$a}"] = in_array($a, $spec, true);
            } else { // 'none'
                $perms[$module] = false;
                foreach ($actions as $a) $perms["{$module}.{$a}"] = false;
            }
        }
        return $perms;
    }
}
