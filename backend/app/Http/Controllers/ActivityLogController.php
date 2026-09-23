<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use Illuminate\Http\Request;

/**
 * The audit trail: who did what, from where, and when.
 *
 * Not to be confused with AuditLogController, which despite the name is the INVENTORY movement
 * log - stock in, stock out, corrections. That one answers "where did the material go". This one
 * answers "who was in the system, what did they change, and did anybody try to get in who should
 * not have", which is a different question and the one a security review asks.
 */
class ActivityLogController extends Controller
{
    /**
     * GET /api/admin/activity-logs
     *
     * Filters: q (free text over person, action and description), action, group, actor,
     * entityType, entityId, startDate, endDate. Newest first.
     */
    public function index(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'auditLogs')) {
                return $this->unauthorizedResponse();
            }

            $query = ActivityLog::orderBy('createdAt', 'desc');

            if ($request->filled('action'))     $query->where('action', $request->action);
            if ($request->filled('entityType')) $query->where('entityType', $request->entityType);
            if ($request->filled('entityId'))   $query->where('entityId', $request->entityId);
            if ($request->filled('actor'))      $query->where('performedBy', $request->actor);
            if ($request->filled('startDate'))  $query->where('createdAt', '>=', $request->startDate);
            if ($request->filled('endDate'))    $query->where('createdAt', '<=', $request->endDate);

            // A whole group at once - "show me everything about who got in", rather than making
            // somebody pick sign-in, refused, locked out and signed out one at a time.
            if ($request->filled('group')) {
                $wanted = array_keys(array_filter(
                    ActivityLog::KINDS,
                    fn ($k) => $k[1] === $request->group
                ));
                $query->whereIn('action', $wanted ?: ['__none__']);
            }

            $limit = min(max((int) $request->query('limit', 100), 1), 200);
            $logs  = $query->limit($limit)->get();

            // Free text is matched here rather than in Mongo: the fields worth searching are
            // spread across four keys and one of them is a snapshotted name, and a regex per
            // field on a growing collection costs more than filtering one page of results.
            if ($request->filled('q')) {
                $q = mb_strtolower(trim($request->q));
                $logs = $logs->filter(function ($l) use ($q) {
                    $hay = mb_strtolower(implode(' ', array_filter([
                        $l->performedByName, $l->performedByEmail, $l->performedByRole,
                        $l->description, ActivityLog::label($l->action), $l->ip,
                    ])));
                    return str_contains($hay, $q);
                })->values();
            }

            // Reading the audit log is itself something a log should record - "who had access,
            // including me looking at it" is exactly the question it exists to answer. Only the
            // first page, so paging through a long list does not write an entry per scroll.
            if (!$request->filled('page') && !$request->filled('q')) {
                $this->logActivity($request, 'viewed_audit_log', 'audit', null, 'Opened the audit log');
            }

            return $this->successResponse('Activity logs fetched.', [
                'data'  => $logs->map(fn ($l) => [
                    'id'          => (string) $l->_id,
                    'action'      => $l->action,
                    'label'       => ActivityLog::label($l->action),
                    'group'       => ActivityLog::group($l->action),
                    'entityType'  => $l->entityType,
                    'entityId'    => $l->entityId,
                    'description' => $l->description,
                    'actorId'     => $l->performedBy,
                    'actorName'   => $l->performedByName ?: ($l->performedByEmail ?: 'Someone not signed in'),
                    'actorEmail'  => $l->performedByEmail,
                    'actorRole'   => $l->performedByRole,
                    'ip'          => $l->ip,
                    'device'      => $l->device,
                    'metadata'    => $l->metadata,
                    'at'          => optional($l->createdAt)->toIso8601String(),
                ])->values(),
                'total' => $logs->count(),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch activity logs.');
        }
    }

    /**
     * GET /api/admin/activity-logs/summary
     *
     * The four figures worth a tile on a security screen. They are about ACCESS and CHANGE -
     * the page used to show Total Stock In and Total Restocks, which belong to the inventory
     * module and told nobody anything about who had been in the system.
     */
    public function summary(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'auditLogs')) {
                return $this->unauthorizedResponse();
            }

            $since = $request->filled('startDate')
                ? \Carbon\Carbon::parse($request->startDate)
                : now()->startOfDay();
            $until = $request->filled('endDate')
                ? \Carbon\Carbon::parse($request->endDate)
                : now();

            $rows = ActivityLog::where('createdAt', '>=', $since)
                ->where('createdAt', '<=', $until)
                ->get(['action', 'performedBy', 'ip', 'createdAt']);

            $signIns  = $rows->where('action', 'login');
            $refused  = $rows->whereIn('action', ['login_failed', 'login_locked', 'two_factor_failed']);
            $changes  = $rows->reject(fn ($r) => ActivityLog::group($r->action) === 'access');

            return $this->successResponse('Summary fetched.', [
                'signIns'      => $signIns->count(),
                // Distinct accounts, not sessions: three sign-ins by one person is one person.
                'people'       => $signIns->pluck('performedBy')->filter()->unique()->count(),
                'refused'      => $refused->count(),
                // Where the refusals came from. One address failing repeatedly is a different
                // problem from ten people each mistyping once, and the count alone hides which.
                'refusedFrom'  => $refused->pluck('ip')->filter()->unique()->count(),
                'changes'      => $changes->count(),
                'from'         => $since->toIso8601String(),
                'to'           => $until->toIso8601String(),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch the summary.');
        }
    }

    /** GET /api/admin/activity-logs/kinds - what the filters can offer, from one list. */
    public function kinds(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'auditLogs')) {
                return $this->unauthorizedResponse();
            }
            $out = [];
            foreach (ActivityLog::KINDS as $action => [$label, $group]) {
                $out[] = ['action' => $action, 'label' => $label, 'group' => $group];
            }
            return $this->successResponse('Kinds fetched.', $out);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch the kinds.');
        }
    }
}
