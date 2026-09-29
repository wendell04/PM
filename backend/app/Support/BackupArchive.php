<?php

namespace App\Support;

use Illuminate\Support\Facades\Storage;

/**
 * The backup file format, shared by db:backup and db:restore so the two cannot drift apart.
 *
 * One gzip stream: a line {"$collection":"orders"} starts each collection, and every document after it
 * is one line of MongoDB canonical Extended JSON - the form that keeps ObjectIds, dates and number
 * types exactly, so a restore puts back the same data rather than strings that look like it. Plain
 * gzip, not zip, so it needs no extra PHP extension. Encrypted with AES-256-GCM, which also detects a
 * damaged or tampered file instead of restoring garbage:
 *
 *     "PMB1" | 12-byte IV | 16-byte tag | ciphertext
 *
 * The key is BACKUP_KEY when set, otherwise derived from APP_KEY. Rotating APP_KEY without a
 * BACKUP_KEY makes older backups unreadable, which is why BACKUP_KEY exists.
 */
final class BackupArchive
{
    public const MAGIC  = 'PMB1';
    public const PREFIX = 'backups/';
    public const EXT    = '.pmb';

    /** Collections not worth keeping: sessions, caches, queues and sign-in tokens rebuild themselves. */
    public const SKIP = ['sessions', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs', 'personal_access_tokens', 'password_reset_tokens'];

    public static function key(): string
    {
        $secret = (string) (config('app.backup_key') ?: config('app.key'));
        return hash('sha256', $secret, true);
    }

    public static function encrypt(string $plain): string
    {
        $iv  = random_bytes(12);
        $tag = '';
        $ct  = openssl_encrypt($plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($ct === false) throw new \RuntimeException('Encryption failed.');
        return self::MAGIC . $iv . $tag . $ct;
    }

    public static function decrypt(string $blob): string
    {
        if (substr($blob, 0, 4) !== self::MAGIC) {
            throw new \RuntimeException('Not a PersonalizeMe backup file.');
        }
        $iv  = substr($blob, 4, 12);
        $tag = substr($blob, 16, 16);
        $pt  = openssl_decrypt(substr($blob, 32), 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($pt === false) {
            throw new \RuntimeException('Could not decrypt: the file is damaged, or it was made with a different BACKUP_KEY / APP_KEY.');
        }
        return $pt;
    }

    /** Is cloud storage (S3 / Cloudflare R2) configured at all. */
    public static function cloudConfigured(): bool
    {
        return (bool) config('filesystems.disks.s3.bucket') && (bool) config('filesystems.disks.s3.key');
    }

    /** The cloud disk, set to throw so a failed upload is reported instead of silently returning false. */
    public static function cloud()
    {
        return Storage::build(array_merge(config('filesystems.disks.s3'), ['throw' => true]));
    }

    public static function localDir(): string
    {
        return storage_path('backups');
    }
}
