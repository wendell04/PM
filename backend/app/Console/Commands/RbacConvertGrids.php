<?php

namespace App\Console\Commands;

use App\Models\RolePermission;
use App\Models\User;
use App\Support\PermissionCatalog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * Saves every stored permission grid in the row keys (PermissionCatalog::rows).
 *
 * The server already upgrades an old grid as it reads it, so nothing is broken before this runs -
 * this makes the stored grids match what the server believes, so the Access screen shows exactly
 * what applies. The previous grid is kept on the same record (permissionsBeforeRows) so the
 * conversion can be undone by hand.
 *
 *   php artisan rbac:convert-grids           # preview, writes nothing
 *   php artisan rbac:convert-grids --apply   # write
 */
class RbacConvertGrids extends Command
{
    protected $signature = 'rbac:convert-grids {--apply : Write the converted grids (default is a preview)}';
    protected $description = 'Convert stored role and staff permission grids to the See/Work row keys.';

    /**
     * Templates the owner specified outright, applied instead of a translation of the old ticks.
     * Production Staff (2026-09-22): Orders and Job Orders to monitor, Production and QC to work,
     * the stock overview to monitor - no stock-outs, no job order edits, nothing else.
     */
    private const PRESETS = [
        'productionStaff' => [
            'orders.view' => true,
            'jobOrders.view' => true,
            'production.view' => true, 'production.work' => true,
            'qc.view' => true, 'qc.work' => true,
            'stock.view' => true,
        ],
    ];

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $this->info(($apply ? '' : '[PREVIEW - nothing is written] ') . 'Converting permission grids to rows.');
        $this->newLine();

        foreach (RolePermission::all() as $rec) {
            $old = (array) ($rec->permissions ?? []);
            $new = isset(self::PRESETS[$rec->role])
                ? PermissionCatalog::completeLevels(self::PRESETS[$rec->role])
                : PermissionCatalog::normalize($old);
            $this->line('<comment>Role: ' . ($rec->label ?: $rec->role) . '</comment>'
                . (isset(self::PRESETS[$rec->role]) ? '  (set to the owner\'s specification)' : ''));
            $this->line('  ' . self::describe($new));
            if ($apply && $new != $old) {
                if (!isset($rec->permissionsBeforeRows)) $rec->permissionsBeforeRows = $old;
                $rec->permissions = $new;
                $rec->save();
            }
        }

        $this->newLine();
        foreach (User::whereNotIn('role', ['customer'])->get() as $u) {
            $old = $u->permissions ?? null;
            if (!is_array($old) || $old === []) continue;
            $new = PermissionCatalog::normalize($old);
            $this->line('<comment>Person: ' . trim(($u->firstName ?? '') . ' ' . ($u->lastName ?? '')) . " ({$u->role}) - their own grid</comment>");
            $this->line('  ' . self::describe($new));
            if ($apply && $new != $old) {
                if (!isset($u->permissionsBeforeRows)) $u->permissionsBeforeRows = $old;
                $u->permissions = $new;
                $u->save();
            }
        }

        // Everyone's sidebar reads a 60-second cache of their map.
        if ($apply) {
            foreach (User::whereNotIn('role', ['customer'])->get(['_id']) as $u) {
                Cache::forget('admin_permissions_' . (string) $u->_id);
            }
        }

        $this->newLine();
        $this->info($apply ? 'Done. Old grids are kept on each record as permissionsBeforeRows.'
                           : 'Preview only. Run with --apply to write.');
        return self::SUCCESS;
    }

    /** "Orders: see | Production: WORK +Refunds" - the grid as the owner reads it. */
    public static function describe(array $g): string
    {
        $out = [];
        foreach (PermissionCatalog::rows() as $r) {
            $see  = $r['view']['keys'] && !array_diff($r['view']['keys'], array_keys($g));
            $work = $r['work']['keys'] && !array_diff($r['work']['keys'], array_keys($g));
            $ex   = array_values(array_map(fn ($k) => $r['extras'][$k][0], array_intersect(array_keys($r['extras']), array_keys($g))));
            if (!$see && !$work && !$ex) continue;
            $out[] = $r['label'] . ': ' . ($work ? 'WORK' : 'see') . ($ex ? ' +' . implode(' +', $ex) : '');
        }
        return $out ? implode(' | ', $out) : '(nothing - Home and their own Settings only)';
    }
}
