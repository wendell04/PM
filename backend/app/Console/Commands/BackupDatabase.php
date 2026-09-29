<?php

namespace App\Console\Commands;

use App\Models\BackupRun;
use App\Support\BackupArchive;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Nightly backup of the whole database, encrypted, sent to cloud storage (S3 / Cloudflare R2).
 *
 * What it replaced: 16 hand-listed collections (job orders, recipes, stock history and chat messages
 * were not among them), JSON that lost ObjectId and date types, and a file kept only on the server's
 * disk - which Railway wipes on every deploy, so no backup ever survived to be used. Every run is now
 * recorded in backup_runs, which is what Settings and the health check read.
 */
class BackupDatabase extends Command
{
    protected $signature   = 'db:backup {--no-s3 : Keep it on the server only} {--trigger=schedule} {--by=}';
    protected $description = 'Back up every collection to an encrypted file and upload it to cloud storage';

    private const KEEP_DAYS = 30;

    public function handle(): int
    {
        $name = now('Asia/Manila')->format('Y-m-d_His');
        $run  = BackupRun::create([
            'name' => $name, 'status' => 'running', 'trigger' => (string) $this->option('trigger'),
            'by' => $this->option('by') ?: null, 'startedAt' => now(),
        ]);
        $workDir = BackupArchive::localDir() . "/tmp_{$name}";
        $gzPath  = $workDir . '/dump.ndjson.gz';
        $outPath = BackupArchive::localDir() . "/{$name}" . BackupArchive::EXT;

        try {
            if (!is_dir($workDir)) mkdir($workDir, 0755, true);

            [$collections, $documents] = $this->export($gzPath);
            file_put_contents($outPath, BackupArchive::encrypt(file_get_contents($gzPath)));
            $this->removeDir($workDir);
            $size = filesize($outPath);

            $cloudKey = null;
            $cloudError = null;
            if (!$this->option('no-s3') && BackupArchive::cloudConfigured()) {
                try {
                    $cloudKey = BackupArchive::PREFIX . $name . BackupArchive::EXT;
                    $disk = BackupArchive::cloud();
                    $stream = fopen($outPath, 'r');
                    $disk->put($cloudKey, $stream);
                    if (is_resource($stream)) fclose($stream);
                    if ((int) $disk->size($cloudKey) !== (int) $size) {
                        throw new \RuntimeException('Uploaded file size does not match.');
                    }
                    $this->pruneCloud($disk);
                } catch (\Throwable $e) {
                    $cloudKey = null;
                    $cloudError = 'Cloud upload failed: ' . $e->getMessage();
                }
            }
            $this->pruneLocal();

            $run->fill([
                'status'      => $cloudKey ? 'ok' : 'local_only',
                'storedIn'    => $cloudKey ? 'cloud' : 'server',
                'cloudKey'    => $cloudKey,
                'sizeBytes'   => $size,
                'collections' => $collections,
                'documents'   => $documents,
                'error'       => $cloudError ?? (BackupArchive::cloudConfigured() || $this->option('no-s3') ? null
                    : 'Cloud storage is not set up, so this copy is on the server only and is lost on the next deploy.'),
                'finishedAt'  => now(),
            ])->save();

            $msg = "Backup {$name}: {$collections} collections, {$documents} documents, " . round($size / 1024) . ' KB, '
                . ($cloudKey ? "stored in cloud as {$cloudKey}" : 'server only');
            ($cloudKey ? Log::info("BackupDatabase: {$msg}") : Log::warning("BackupDatabase: {$msg}. " . $run->error));
            $this->info($msg);
            return $cloudKey || $this->option('no-s3') ? self::SUCCESS : self::FAILURE;
        } catch (\Throwable $e) {
            @unlink($outPath);
            $this->removeDir($workDir);
            $run->fill(['status' => 'failed', 'error' => $e->getMessage(), 'finishedAt' => now()])->save();
            Log::error('BackupDatabase: failed: ' . $e->getMessage());
            $this->error('Backup failed: ' . $e->getMessage());
            return self::FAILURE;
        }
    }

    /** Every collection into one gzip stream, canonical Extended JSON so types survive a restore. */
    private function export(string $gzPath): array
    {
        $db = DB::connection('mongodb')->getDatabase();
        $gz = gzopen($gzPath, 'wb6');
        $collections = 0;
        $documents = 0;
        foreach ($db->listCollectionNames() as $name) {
            if (in_array($name, BackupArchive::SKIP, true) || str_starts_with($name, 'system.')) continue;
            gzwrite($gz, json_encode(['$collection' => $name]) . "\n");
            $cursor = $db->selectCollection($name)->find([], ['typeMap' => ['root' => 'bson', 'document' => 'bson', 'array' => 'bson']]);
            foreach ($cursor as $doc) {
                gzwrite($gz, $doc->toCanonicalExtendedJSON() . "\n");
                $documents++;
            }
            $collections++;
        }
        gzclose($gz);
        return [$collections, $documents];
    }

    private function pruneCloud($disk): void
    {
        $cutoff = now('Asia/Manila')->subDays(self::KEEP_DAYS)->format('Y-m-d_His');
        foreach ($disk->files(rtrim(BackupArchive::PREFIX, '/')) as $file) {
            $base = basename($file, BackupArchive::EXT);
            if (str_ends_with($file, BackupArchive::EXT) && $base < $cutoff) $disk->delete($file);
        }
    }

    private function pruneLocal(): void
    {
        $dir = BackupArchive::localDir();
        if (!is_dir($dir)) return;
        $cutoff = now()->subDays(self::KEEP_DAYS)->timestamp;
        foreach (scandir($dir) as $entry) {
            $path = "{$dir}/{$entry}";
            if ($entry === '.' || $entry === '..') continue;
            if (is_file($path) && filemtime($path) < $cutoff) @unlink($path);
            if (is_dir($path) && str_starts_with($entry, 'tmp_') && filemtime($path) < $cutoff) $this->removeDir($path);
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
