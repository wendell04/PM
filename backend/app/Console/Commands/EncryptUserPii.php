<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * One-time migration: encrypt existing plaintext address and totp_secret
 * fields so they match the 'encrypted' cast added to User model.
 *
 * Run ONCE after deploying the encrypted cast. Safe to re-run — already-
 * encrypted values are detected and skipped.
 *
 * Usage: php artisan users:encrypt-pii [--dry-run]
 */
class EncryptUserPii extends Command
{
    protected $signature = 'users:encrypt-pii {--dry-run : Preview changes without writing}';
    protected $description = 'Encrypt existing plaintext PII fields (address, totp_secret) for all users';

    public function handle(): int
    {
        $dryRun = $this->option('dry-run');
        $this->info($dryRun ? '[DRY RUN] No changes will be written.' : 'Starting PII encryption migration...');

        $total = 0;
        $encrypted = 0;
        $skipped = 0;
        $errors = 0;

        // Bypass the model casts so we can read raw stored values
        $raw = DB::connection('mongodb')->getCollection('users')->find([])->toArray();

        foreach ($raw as $doc) {
            $total++;
            $id = (string) ($doc['_id'] ?? '');
            $updates = [];

            foreach (['address', 'totp_secret'] as $field) {
                $value = $doc[$field] ?? null;
                if ($value === null || $value === '') continue;

                // Already encrypted values start with "eyJ" (base64-encoded JSON envelope)
                if (is_string($value) && str_starts_with($value, 'eyJ')) {
                    $skipped++;
                    continue;
                }

                try {
                    $updates[$field] = Crypt::encryptString((string) $value);
                    $this->line("  [{$id}] Will encrypt {$field}");
                } catch (\Exception $e) {
                    $this->error("  [{$id}] Failed to encrypt {$field}: {$e->getMessage()}");
                    $errors++;
                }
            }

            if (!empty($updates) && !$dryRun) {
                DB::connection('mongodb')->getCollection('users')
                    ->updateOne(
                        ['_id' => $doc['_id']],
                        ['$set' => $updates]
                    );
                $encrypted += count($updates);
            } elseif (!empty($updates)) {
                $encrypted += count($updates);
            }
        }

        $this->newLine();
        $this->info("Done. Users processed: {$total} | Fields encrypted: {$encrypted} | Already encrypted (skipped): {$skipped} | Errors: {$errors}");

        return $errors > 0 ? self::FAILURE : self::SUCCESS;
    }
}
