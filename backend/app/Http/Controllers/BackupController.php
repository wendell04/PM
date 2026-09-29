<?php

namespace App\Http\Controllers;

use App\Models\BackupRun;
use App\Support\BackupArchive;
use App\Support\Rbac;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

/**
 * Backups on the Settings page: when the last one ran, where it went, and a button to run one now.
 * System admin and owner only - a backup holds every customer's data.
 */
class BackupController extends Controller
{
    private function allowed(Request $request): bool
    {
        $u = $request->user();
        return Rbac::isSuperAdmin($u) || Rbac::isOwner($u);
    }

    /** GET /api/admin/backups */
    public function index(Request $request)
    {
        if (!$this->allowed($request)) return $this->unauthorizedResponse();

        $runs = BackupRun::orderBy('startedAt', 'desc')->limit(10)->get()->map(fn ($r) => [
            'id'          => (string) $r->_id,
            'name'        => $r->name,
            'status'      => $r->status,
            'trigger'     => $r->trigger,
            'by'          => $r->by,
            'storedIn'    => $r->storedIn,
            'sizeBytes'   => $r->sizeBytes,
            'collections' => $r->collections,
            'documents'   => $r->documents,
            'error'       => $r->error,
            'startedAt'   => $r->startedAt?->toIso8601String(),
            'finishedAt'  => $r->finishedAt?->toIso8601String(),
        ])->values();
        $lastGood = BackupRun::where('status', 'ok')->orderBy('startedAt', 'desc')->first();

        return $this->successResponse('Backups.', [
            'cloudConfigured' => BackupArchive::cloudConfigured(),
            'schedule'        => 'Every day at 2:00 AM',
            'keepDays'        => 30,
            'lastGood'        => $lastGood?->finishedAt?->toIso8601String(),
            'runs'            => $runs,
        ]);
    }

    /** POST /api/admin/backups/run - run one now and return how it went. */
    public function run(Request $request)
    {
        if (!$this->allowed($request)) return $this->unauthorizedResponse();
        if (BackupRun::where('status', 'running')->where('startedAt', '>', now()->subMinutes(10))->exists()) {
            return $this->errorResponse('A backup is already running. Wait a minute and refresh.', 409);
        }
        @set_time_limit(300);
        $u = $request->user();
        Artisan::call('db:backup', ['--trigger' => 'manual', '--by' => trim(($u->firstName ?? '') . ' ' . ($u->lastName ?? ''))]);
        $run = BackupRun::orderBy('startedAt', 'desc')->first();

        $this->logActivity($request, 'backup.run', 'system', (string) ($run?->_id ?? ''),
            'Ran a database backup: ' . ($run?->status ?? 'unknown'), ['status' => $run?->status, 'storedIn' => $run?->storedIn]);

        $msg = match ($run?->status) {
            'ok'         => 'Backup saved to cloud storage.',
            'local_only' => 'Backup made, but it is on the server only: ' . $run->error,
            default      => 'Backup failed: ' . ($run?->error ?? 'unknown error'),
        };
        return $run?->status === 'ok'
            ? $this->successResponse($msg, ['status' => $run->status])
            : $this->errorResponse($msg, 422, ['status' => $run?->status]);
    }
}
