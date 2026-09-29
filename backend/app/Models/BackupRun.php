<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

/**
 * One run of db:backup. Kept in the database, not on the server's disk: Railway wipes the disk on
 * every deploy, so a check that looked for backup files there always answered "never" - even on a
 * night the backup ran - and nothing said where the last good copy was.
 */
class BackupRun extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'backup_runs';

    protected $fillable = [
        'name',          // 2026-09-30_020000
        'status',        // running | ok | local_only | failed
        'trigger',       // schedule | manual
        'by',            // who pressed Back up now
        'storedIn',      // cloud | server
        'cloudKey',      // backups/2026-09-30_020000.pmb
        'sizeBytes',
        'collections',
        'documents',
        'error',
        'startedAt',
        'finishedAt',
    ];

    protected $casts = [
        'startedAt'  => 'datetime',
        'finishedAt' => 'datetime',
    ];
}
