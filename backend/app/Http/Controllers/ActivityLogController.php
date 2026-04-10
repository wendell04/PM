<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    /**
     * GET /api/admin/activity-logs
     */
    public function index(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $query = ActivityLog::orderBy('createdAt', 'desc');

            if ($request->filled('action')) {
                $query->where('action', $request->action);
            }

            if ($request->filled('entityType')) {
                $query->where('entityType', $request->entityType);
            }

            if ($request->filled('entityId')) {
                $query->where('entityId', $request->entityId);
            }

            if ($request->filled('startDate')) {
                $query->where('createdAt', '>=', $request->startDate);
            }

            if ($request->filled('endDate')) {
                $query->where('createdAt', '<=', $request->endDate);
            }

            $limit = min((int) $request->query('limit', 100), 200);
            $logs  = $query->limit($limit)->get();

            return $this->successResponse('Activity logs fetched.', [
                'data'  => $logs,
                'total' => $logs->count(),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch activity logs.');
        }
    }
}
