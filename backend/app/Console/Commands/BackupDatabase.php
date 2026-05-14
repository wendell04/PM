<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class BackupDatabase extends Command
{
    protected $signature   = 'db:backup';
    protected $description = 'Export all MongoDB collections to JSON and store in storage/backups/';

    public function handle(): int
    {
        $timestamp = now()->format('Y-m-d_His');
        $dir       = storage_path("backups/{$timestamp}");

        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $collections = [
            'users', 'orders', 'products', 'inventory', 'sales',
            'audit_logs', 'activity_logs', 'suppliers', 'banners',
            'flash_sales', 'order_requests', 'vouchers', 'collections',
            'notifications', 'reviews', 'chats',
        ];

        $errors = [];

        foreach ($collections as $name) {
            try {
                $docs = DB::connection('mongodb')
                    ->getCollection($name)
                    ->find()
                    ->toArray();

                $json = json_encode($docs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                file_put_contents("{$dir}/{$name}.json", $json);
            } catch (\Throwable $e) {
                $errors[] = $name;
                Log::warning("BackupDatabase: failed to export {$name}: " . $e->getMessage());
            }
        }

        // Remove backups older than 30 days
        $this->pruneOldBackups(storage_path('backups'), 30);

        if ($errors) {
            Log::error('BackupDatabase: some collections failed: ' . implode(', ', $errors));
            $this->error('Backup completed with errors: ' . implode(', ', $errors));
            return self::FAILURE;
        }

        Log::info("BackupDatabase: successful backup at {$dir}");
        $this->info("Backup saved to {$dir}");
        return self::SUCCESS;
    }

    private function pruneOldBackups(string $backupRoot, int $keepDays): void
    {
        if (! is_dir($backupRoot)) {
            return;
        }

        $cutoff = now()->subDays($keepDays)->timestamp;

        foreach (scandir($backupRoot) as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }

            $path = "{$backupRoot}/{$entry}";

            if (is_dir($path) && filemtime($path) < $cutoff) {
                array_map('unlink', glob("{$path}/*"));
                rmdir($path);
            }
        }
    }
}
