<?php

namespace App\Console\Commands;

use App\Support\BackupArchive;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Put a backup back - into a SEPARATE database, never over the live one.
 *
 *     php artisan db:restore 2026-09-30_020000 --into=personalizeme_restore
 *
 * The backup is read from the server if it is still there, otherwise from cloud storage. Restoring
 * into a fresh database lets the owner check it (point a test copy at it) before deciding to switch;
 * writing straight over the live database would turn a restore mistake into a second disaster.
 */
class RestoreDatabase extends Command
{
    protected $signature = 'db:restore {name : Backup name, e.g. 2026-09-30_020000, or a path to a .pmb file}
                            {--into= : Database to restore into (must not be the live one)}
                            {--fresh : Empty the target database first}';
    protected $description = 'Restore an encrypted backup into a separate database';

    public function handle(): int
    {
        $into = trim((string) $this->option('into'));
        $live = (string) config('database.connections.mongodb.database');
        if ($into === '') {
            $this->error('Say where to restore: --into=personalizeme_restore');
            return self::FAILURE;
        }
        if ($into === $live) {
            $this->error("Refusing to restore over the live database ({$live}). Restore into another name, check it, then switch.");
            return self::FAILURE;
        }

        try {
            $plain = gzdecode(BackupArchive::decrypt($this->read((string) $this->argument('name'))));
            if ($plain === false) throw new \RuntimeException('The backup could not be unpacked.');

            $target = DB::connection('mongodb')->getClient()->selectDatabase($into);
            $existing = iterator_to_array($target->listCollectionNames());
            if ($existing && !$this->option('fresh')) {
                throw new \RuntimeException("Database {$into} is not empty. Use --fresh to empty it first, or pick another name.");
            }
            if ($this->option('fresh')) foreach ($existing as $c) $target->dropCollection($c);

            $total = 0;
            $name = null;
            $batch = [];
            $count = 0;
            $flush = function () use (&$batch, &$count, &$name, $target) {
                if ($name !== null && $batch) { $target->selectCollection($name)->insertMany($batch); $count += count($batch); }
                $batch = [];
            };
            $finish = function () use (&$count, &$name, &$total, $target, $flush) {
                if ($name === null) return;
                $flush();
                if ($count === 0) $target->createCollection($name);
                $this->line(sprintf('  %-28s %d', $name, $count));
                $total += $count;
            };
            foreach (preg_split("/\r?\n/", $plain) as $line) {
                if ($line === '') continue;
                if (str_starts_with($line, '{"$collection":')) {
                    $finish();
                    $name = json_decode($line, true)['$collection'];
                    $count = 0;
                    continue;
                }
                $batch[] = \MongoDB\BSON\Document::fromJSON($line);
                if (count($batch) === 500) $flush();
            }
            $finish();

            $this->info("Restored {$total} documents into {$into}.");
            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Restore failed: ' . $e->getMessage());
            return self::FAILURE;
        }
    }

    private function read(string $name): string
    {
        if (is_file($name)) return file_get_contents($name);
        $base  = basename($name, BackupArchive::EXT);
        $local = BackupArchive::localDir() . "/{$base}" . BackupArchive::EXT;
        if (is_file($local)) return file_get_contents($local);
        if (BackupArchive::cloudConfigured()) {
            return BackupArchive::cloud()->get(BackupArchive::PREFIX . $base . BackupArchive::EXT);
        }
        throw new \RuntimeException("Backup {$base} is not on this server and cloud storage is not set up.");
    }
}
