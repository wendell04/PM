<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

class HealthController extends Controller
{
    public function check(): JsonResponse
    {
        $checks = [];
        $allOk  = true;

        // MongoDB connectivity
        try {
            DB::connection('mongodb')->command(['ping' => 1]);
            $checks['database'] = ['status' => 'ok'];
        } catch (Throwable $e) {
            $checks['database'] = ['status' => 'error', 'message' => 'Cannot reach MongoDB'];
            $allOk = false;
        }

        // Filesystem writable (storage/logs and storage/backups)
        $storageOk = is_writable(storage_path('logs')) && is_writable(storage_path());
        $checks['storage'] = ['status' => $storageOk ? 'ok' : 'error'];
        if (!$storageOk) $allOk = false;

        // Queue - check that the jobs table/collection is reachable
        try {
            $pending = DB::connection('mongodb')->collection('jobs')->count();
            $checks['queue'] = ['status' => 'ok', 'pending_jobs' => $pending];
        } catch (Throwable $e) {
            $checks['queue'] = ['status' => 'error', 'message' => 'Cannot read jobs collection'];
            // Queue failure is degraded but not fatal
        }

        // Cache - write + read a test key
        try {
            $cacheKey = 'health_check_' . time();
            Cache::put($cacheKey, 'ok', 5);
            $val = Cache::get($cacheKey);
            Cache::forget($cacheKey);
            $checks['cache'] = ['status' => $val === 'ok' ? 'ok' : 'error'];
        } catch (Throwable $e) {
            $checks['cache'] = ['status' => 'error', 'message' => 'Cache read/write failed'];
        }

        // Mail - check SMTP config is present (does NOT send an actual email)
        $mailConfigured = !empty(config('mail.mailers.smtp.host'))
            && !empty(config('mail.from.address'));
        $checks['mail'] = ['status' => $mailConfigured ? 'ok' : 'misconfigured'];

        // WebSocket / Reverb - check that the broadcasting connection is set
        $broadcastDriver = config('broadcasting.default');
        $checks['broadcast'] = ['status' => 'ok', 'driver' => $broadcastDriver];

        // External API - PayMongo reachability (HEAD request, 3s timeout)
        try {
            $response = Http::timeout(3)->head('https://api.paymongo.com');
            $checks['paymongo'] = ['status' => $response->successful() || $response->status() === 401 ? 'ok' : 'degraded'];
        } catch (Throwable $e) {
            $checks['paymongo'] = ['status' => 'unreachable'];
        }

        // Last backup, from the run log in the database. It used to look for files on the server's
        // disk, which Railway wipes on every deploy, so it always said "never". A copy on the server
        // only is not counted as a backup for the same reason.
        try {
            $last = \App\Models\BackupRun::where('status', 'ok')->orderBy('startedAt', 'desc')->first();
            $age  = $last?->finishedAt ? (int) $last->finishedAt->diffInHours(now()) : null;
            $checks['backup'] = [
                'status'          => $age === null ? 'no_backup' : ($age > 25 ? 'stale' : 'ok'),
                'last_backup_age' => $age !== null ? "{$age}h ago" : 'never',
                'cloud'           => \App\Support\BackupArchive::cloudConfigured(),
            ];
        } catch (Throwable $e) {
            $checks['backup'] = ['status' => 'unknown'];
        }

        $status = $allOk ? 200 : 503;

        return response()->json([
            'status'    => $allOk ? 'healthy' : 'degraded',
            'checks'    => $checks,
            'timestamp' => now()->toIso8601String(),
            'version'   => config('app.version', '1.0.0'),
        ], $status);
    }
}
