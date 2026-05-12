<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Product;
use Illuminate\Support\Facades\Cache;

class CleanupDraftDuplicates extends Command
{
    protected $signature   = 'cleanup:draft-duplicates {--dry-run : List matches without deleting}';
    protected $description = 'Hard-delete duplicate draft products (Custom Mugs, Binding services) from the database';

    public function handle(): int
    {
        $patterns = ['Custom Mug', 'Binding'];

        $this->info('Scanning for draft/duplicate products...');
        $this->newLine();

        $toDelete = collect();

        foreach ($patterns as $pattern) {
            $matches = Product::where('name', 'regex', new \MongoDB\BSON\Regex(preg_quote($pattern, '/'), 'i'))
                ->where('isPublished', false)
                ->get();

            if ($matches->isNotEmpty()) {
                $this->line("Pattern: \"{$pattern}\" — {$matches->count()} unpublished match(es):");
                foreach ($matches as $p) {
                    $this->line("  [{$p->_id}] {$p->name} | active=" . ($p->isActive ? 'true' : 'false') . " | archived=" . ($p->isArchived ? 'true' : 'false'));
                }
                $toDelete = $toDelete->merge($matches);
            } else {
                $this->warn("Pattern: \"{$pattern}\" — no unpublished matches found.");
            }
        }

        $this->newLine();

        if ($toDelete->isEmpty()) {
            $this->info('Nothing to delete.');
            return 0;
        }

        if ($this->option('dry-run')) {
            $this->warn("DRY RUN — {$toDelete->count()} product(s) would be deleted. Run without --dry-run to execute.");
            return 0;
        }

        if (!$this->confirm("Delete {$toDelete->count()} product(s) permanently? This cannot be undone.")) {
            $this->info('Cancelled.');
            return 0;
        }

        $count = 0;
        foreach ($toDelete as $p) {
            $p->delete();
            $this->line("  Deleted: [{$p->_id}] {$p->name}");
            $count++;
        }

        Cache::forget('admin_products_list');

        $this->newLine();
        $this->info("Done. {$count} product(s) permanently deleted.");
        return 0;
    }
}
