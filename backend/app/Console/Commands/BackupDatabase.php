<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class BackupDatabase extends Command
{
    protected $signature   = 'db:backup {--no-s3 : Skip S3 upload even if configured}';
    protected $description = 'Export MongoDB collections to an AES-256 encrypted archive; optionally upload to S3';

    private const CIPHER    = 'AES-256-CBC';
    private const KEEP_DAYS = 30;

    private const COLLECTIONS = [
        'users', 'orders', 'products', 'inventory', 'sales',
        'audit_logs', 'activity_logs', 'suppliers', 'banners',
        'flash_sales', 'order_requests', 'vouchers', 'collections',
        'notifications', 'reviews', 'chats',
    ];

    public function handle(): int
    {
        $timestamp   = now()->format('Y-m-d_His');
        $workDir     = storage_path("backups/tmp_{$timestamp}");
        $zipPath     = storage_path("backups/{$timestamp}.zip");
        $encPath     = storage_path("backups/{$timestamp}.zip.enc");

        try {
            mkdir($workDir, 0755, true);

            // 1 — Export collections to JSON
            $errors = $this->exportCollections($workDir);

            // 2 — Compress to zip
            $this->compress($workDir, $zipPath);

            // 3 — Encrypt the zip
            $this->encrypt($zipPath, $encPath);

            // 4 — Remove plaintext zip + tmp dir immediately
            @unlink($zipPath);
            $this->removeDir($workDir);

            // 5 — Upload to S3 if configured
            $s3Path = null;
            if (!$this->option('no-s3') && config('filesystems.disks.s3.bucket')) {
                $s3Path = $this->uploadToS3($encPath, $timestamp);
            }

            // 6 — Prune old local backups
            $this->pruneOldBackups(storage_path('backups'));

            $summary = "Backup {$timestamp}: local={$encPath}"
                . ($s3Path ? " | s3={$s3Path}" : ' | S3 skipped');

            if ($errors) {
                Log::warning("BackupDatabase: completed with errors. Failed: " . implode(', ', $errors) . ". {$summary}");
                $this->warn('Backup completed with errors: ' . implode(', ', $errors));
                return self::FAILURE;
            }

            Log::info("BackupDatabase: {$summary}");
            $this->info($summary);
            return self::SUCCESS;

        } catch (\Throwable $e) {
            // Clean up any partial artifacts
            @unlink($zipPath);
            @unlink($encPath);
            if (is_dir($workDir)) $this->removeDir($workDir);

            Log::error('BackupDatabase: fatal error: ' . $e->getMessage());
            $this->error('Backup failed: ' . $e->getMessage());
            return self::FAILURE;
        }
    }

    private function exportCollections(string $dir): array
    {
        $errors = [];

        foreach (self::COLLECTIONS as $name) {
            try {
                $docs = DB::connection('mongodb')
                    ->getCollection($name)
                    ->find()
                    ->toArray();

                file_put_contents(
                    "{$dir}/{$name}.json",
                    json_encode($docs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
                );
            } catch (\Throwable $e) {
                $errors[] = $name;
                Log::warning("BackupDatabase: failed to export {$name}: " . $e->getMessage());
            }
        }

        return $errors;
    }

    private function compress(string $sourceDir, string $zipPath): void
    {
        $zip = new \ZipArchive();
        if ($zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException("Cannot create zip at {$zipPath}");
        }

        foreach (glob("{$sourceDir}/*.json") as $file) {
            $zip->addFile($file, basename($file));
        }

        $zip->close();
    }

    private function encrypt(string $inputPath, string $outputPath): void
    {
        $key = substr(hash('sha256', config('app.key'), true), 0, 32);
        $iv  = random_bytes(openssl_cipher_iv_length(self::CIPHER));

        $plaintext  = file_get_contents($inputPath);
        $ciphertext = openssl_encrypt($plaintext, self::CIPHER, $key, OPENSSL_RAW_DATA, $iv);

        if ($ciphertext === false) {
            throw new \RuntimeException('Encryption failed: ' . openssl_error_string());
        }

        // Prepend IV so we can decrypt later: [16-byte IV][ciphertext]
        file_put_contents($outputPath, $iv . $ciphertext);
    }

    private function uploadToS3(string $localPath, string $timestamp): string
    {
        $s3Key = "backups/{$timestamp}.zip.enc";
        Storage::disk('s3')->put($s3Key, fopen($localPath, 'r'));
        return $s3Key;
    }

    private function pruneOldBackups(string $backupRoot): void
    {
        if (!is_dir($backupRoot)) return;

        $cutoff = now()->subDays(self::KEEP_DAYS)->timestamp;

        foreach (scandir($backupRoot) as $entry) {
            if ($entry === '.' || $entry === '..') continue;

            $path = "{$backupRoot}/{$entry}";

            // Remove old encrypted backup files
            if (is_file($path) && str_ends_with($entry, '.zip.enc') && filemtime($path) < $cutoff) {
                @unlink($path);
            }

            // Remove any leftover tmp dirs
            if (is_dir($path) && str_starts_with($entry, 'tmp_') && filemtime($path) < $cutoff) {
                $this->removeDir($path);
            }
        }
    }

    private function removeDir(string $dir): void
    {
        if (!is_dir($dir)) return;
        foreach (glob("{$dir}/*") as $f) {
            is_dir($f) ? $this->removeDir($f) : @unlink($f);
        }
        @rmdir($dir);
    }
}
