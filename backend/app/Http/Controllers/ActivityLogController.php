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

            $query = $this->filtered($request);

            // One page from the database, not the whole collection into PHP. This is the one
            // table that only grows; the old ceiling of 200 rows meant that past 200 entries the
            // pager was paging through a window, and anything older than the 200th was simply
            // unreachable from this screen.
            $perPage = min(max((int) $request->query('perPage', 50), 1), 200);
            $page    = max((int) $request->query('page', 1), 1);
            $total   = (clone $query)->count();
            $logs    = $query->skip(($page - 1) * $perPage)->limit($perPage)->get();

            // Reading the audit log is itself something a log should record - "who had access,
            // including me looking at it" is exactly the question it exists to answer. Only the
            // first page, so paging through a long list does not write an entry per scroll.
            if ($page === 1 && !$request->filled('q')) {
                $this->logActivity($request, 'audit.viewed', 'audit', null, 'Opened the audit log');
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
                // What MATCHES, not what was returned - the pager needs the size of the whole
                // result to know how many pages there are.
                'total'   => $total,
                'page'    => $page,
                'perPage' => $perPage,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch activity logs.');
        }
    }

    /**
     * The filter, in one place.
     *
     * index() and export() have to select the same rows or the file somebody downloads is not
     * the screen they were looking at - which on an audit log is worse than having no export.
     */
    private function filtered(Request $request)
    {
        $query = ActivityLog::orderBy('createdAt', 'desc');

        if ($request->filled('action'))     $query->where('action', $request->action);
        if ($request->filled('entityType')) $query->where('entityType', $request->entityType);
        if ($request->filled('entityId'))   $query->where('entityId', $request->entityId);
        if ($request->filled('actor'))      $query->where('performedBy', $request->actor);
        if ($request->filled('startDate'))  $query->where('createdAt', '>=', $request->startDate);
        if ($request->filled('endDate'))    $query->where('createdAt', '<=', $request->endDate);

        // Free text. This has to be part of the QUERY, not a filter applied to the rows that come
        // back: filtering after the page has been cut gives a page of five results out of fifty,
        // and a total that counts rows the reader cannot see. The cost is a regex across six
        // fields - worth an index on createdAt and performedBy once this collection is large.
        if ($request->filled('q')) {
            $needle = preg_quote(trim((string) $request->q), '/');
            if ($needle !== '') {
                $query->where(function ($w) use ($needle) {
                    foreach ([
                        'performedByName', 'performedByEmail', 'performedByRole',
                        'description', 'action', 'ip',
                    ] as $field) {
                        $w->orWhere($field, 'regexp', '/' . $needle . '/i');
                    }
                });
            }
        }

        // A whole group at once - "show me everything about who got in", rather than making
        // somebody pick sign-in, refused, locked out and signed out one at a time.
        if ($request->filled('group')) {
            $wanted = array_keys(array_filter(
                ActivityLog::KINDS,
                fn ($k) => $k[1] === $request->group
            ));
            $query->whereIn('action', $wanted ?: ['__none__']);
        }

        return $query;
    }

    /**
     * One CSV cell.
     *
     * A cell beginning =, +, - or @ is a FORMULA to Excel and Google Sheets, and it runs when the
     * file is opened. An audit log is exactly where that matters: the text in it is written by
     * whoever tried to sign in, so an attacker picks their own email address and gets code
     * execution on the machine of the person investigating them. Prefixed with a quote, which is
     * the documented way to make a spreadsheet treat a cell as text.
     */
    private function csvCell($value): string
    {
        $v = (string) ($value ?? '');
        $v = str_replace(["\r", "\n"], ' ', $v);
        if ($v !== '' && in_array($v[0], ['=', '+', '-', '@', "\t"], true)) {
            $v = "'" . $v;
        }
        return '"' . str_replace('"', '""', $v) . '"';
    }

    /**
     * GET /api/admin/activity-logs/export
     *
     * The same rows the screen is showing, as a file. Streamed rather than built in memory: an
     * audit log is the one collection that only ever grows, and holding a year of it in a PHP
     * array to hand back in one response is how an export takes the site down with it.
     */
    public function export(Request $request)
    {
        if (!$this->hasPermission($request, 'auditLogs')) {
            return $this->unauthorizedResponse();
        }

        // Taking a copy of the trail out of the system is itself an event, and a more serious one
        // than reading it on screen. Recorded BEFORE the file is built, so a download that fails
        // half way still leaves the attempt on the record.
        $this->logActivity($request, 'audit.exported', 'audit', null, 'Exported the audit log', [
            'group'     => $request->input('group'),
            'startDate' => $request->input('startDate'),
            'endDate'   => $request->input('endDate'),
        ]);

        $query    = $this->filtered($request);
        $filename = 'audit-log-' . now()->format('Y-m-d-Hi') . '.csv';

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            // The byte order mark. Without it Excel on Windows reads the file as the system
            // codepage and every peso sign and accented name arrives as mojibake.
            fwrite($out, "\xEF\xBB\xBF");
            fwrite($out, implode(',', [
                'When', 'Who', 'Email', 'Role', 'Action', 'What happened',
                'From', 'Device', 'About', 'Details',
            ]) . "\r\n");

            $query->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $l) {
                    fwrite($out, implode(',', array_map([$this, 'csvCell'], [
                        optional($l->createdAt)->format('Y-m-d H:i:s'),
                        $l->performedByName ?: ($l->performedByEmail ?: 'Not signed in'),
                        $l->performedByEmail,
                        $l->performedByRole,
                        ActivityLog::label($l->action),
                        $l->description,
                        $l->ip,
                        $l->device,
                        trim(($l->entityType ?? '') . ' ' . ($l->entityId ?? '')),
                        $l->metadata ? json_encode($l->metadata) : '',
                    ])) . "\r\n");
                }
            });

            fclose($out);
        }, $filename, [
            'Content-Type'        => 'text/csv; charset=UTF-8',
            'Cache-Control'       => 'no-store, no-cache, must-revalidate, private',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
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

            // No startDate means ALL TIME, not today. Defaulting to the start of today made the
            // tiles disagree with the list beside them and with their own label - the screen said
            // "in all time" over figures that covered a few hours.
            $since = $request->filled('startDate') ? \Carbon\Carbon::parse($request->startDate) : null;
            $until = $request->filled('endDate')   ? \Carbon\Carbon::parse($request->endDate)   : now();

            $q = ActivityLog::where('createdAt', '<=', $until);
            if ($since) $q->where('createdAt', '>=', $since);
            $rows = $q->get(['action', 'performedBy', 'ip', 'createdAt']);

            $signIns  = $rows->whereIn('action', ActivityLog::SIGN_IN);
            $refused  = $rows->whereIn('action', ActivityLog::REFUSED);
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
                'from'         => $since?->toIso8601String(),
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
