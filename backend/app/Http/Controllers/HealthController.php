<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
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
            $checks['database'] = 'ok';
        } catch (Throwable $e) {
            $checks['database'] = 'error';
            $allOk = false;
        }

        // Filesystem writable (storage/logs)
        $checks['storage'] = is_writable(storage_path('logs')) ? 'ok' : 'error';
        if ($checks['storage'] === 'error') {
            $allOk = false;
        }

        $status = $allOk ? 200 : 503;

        return response()->json([
            'status' => $allOk ? 'healthy' : 'degraded',
            'checks' => $checks,
            'timestamp' => now()->toIso8601String(),
        ], $status);
    }
}
