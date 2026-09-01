<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Log;
use App\Models\User;

abstract class Controller
{
    /**
     * Checks if the current authenticated user is an admin/owner.
     *
     * @param \Illuminate\Http\Request $request
     * @return User|false The user object if admin, false otherwise
     */
    protected function isAdmin(\Illuminate\Http\Request $request)
    {
        $user = $request->user();
        if (!$user) return false;
        // Admin surface = Super Admin (system) or Owner (business). Delegated to
        // the central gate so the Super Admin toggle and role set live in one place.
        if (\App\Support\Rbac::isSuperAdmin($user) || \App\Support\Rbac::isOwner($user)) {
            return $user;
        }
        return false;
    }

    /**
     * Checks if the authenticated user has a specific RBAC permission.
     * Decision is centralized in App\Support\Rbac: Super Admin bypasses per the
     * access toggle, Owner has business authority, staff are checked against the
     * role_permissions grid.
     */
    protected function hasPermission(\Illuminate\Http\Request $request, string $permKey): mixed
    {
        $user = $request->user();
        if (!$user) return false;
        return \App\Support\Rbac::allows($user, $permKey) ? $user : false;
    }

    /**
     * Passes if the user has ANY of the given permission keys.
     * Used where one screen serves multiple roles (e.g. production OR legacy jobOrders).
     */
    protected function hasAnyPermission(\Illuminate\Http\Request $request, array $permKeys): mixed
    {
        $user = $request->user();
        if (!$user) return false;
        foreach ($permKeys as $key) {
            if (\App\Support\Rbac::allows($user, $key)) return $user;
        }
        return false;
    }

    /**
     * Checks if the authenticated user has one of the given roles.
     * Admin and owner always pass — they have full access.
     *
     * @param \Illuminate\Http\Request $request
     * @param string ...$roles
     * @return \App\Models\User|false
     */
    protected function hasRole(\Illuminate\Http\Request $request, string ...$roles): mixed
    {
        $user = $request->user();
        if (!$user) return false;
        // Super Admin and Owner always have access
        if (\App\Support\Rbac::isSuperAdmin($user) || \App\Support\Rbac::isOwner($user)) return $user;
        if (in_array($user->role, $roles)) return $user;
        return false;
    }

    /**
     * Append a security/activity event to the append-only activity_logs collection.
     * Records who did what to whom, when. Never throws — a failed audit write must
     * not break the operation it is recording.
     */
    protected function logActivity(
        \Illuminate\Http\Request $request,
        string $action,
        string $entityType,
        ?string $entityId,
        string $description,
        array $metadata = []
    ): void {
        try {
            $actor = $request->user();
            \App\Models\ActivityLog::create([
                'action'           => $action,
                'entityType'       => $entityType,
                'entityId'         => $entityId,
                'description'      => $description,
                'performedBy'      => $actor ? (string) ($actor->_id ?? $actor->id) : null,
                'performedByEmail' => $actor->email ?? null,
                'metadata'         => $metadata,
                'createdAt'        => now(),
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Activity log write failed', [
                'action' => $action, 'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Standardized success response format.
     *
     * @param string $message
     * @param mixed $data
     * @param int $statusCode
     * @return \Illuminate\Http\JsonResponse
     */
    protected function successResponse($message, $data = null, $statusCode = 200)
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => $data,
        ], $statusCode);
    }

    /**
     * Standardized error response format.
     *
     * @param string $message
     * @param int $statusCode
     * @param mixed $errors
     * @return \Illuminate\Http\JsonResponse
     */
    protected function errorResponse($message, $statusCode = 400, $errors = null)
    {
        $response = [
            'success' => false,
            'message' => $message,
        ];

        if ($errors) {
            $response['errors'] = $errors;
        }

        return response()->json($response, $statusCode);
    }

    /**
     * Standardized validation error response format.
     *
     * @param \Illuminate\Validation\ValidationException $e
     * @return \Illuminate\Http\JsonResponse
     */
    protected function validationErrorResponse($e)
    {
        Log::warning('Validation failed', ['errors' => $e->errors()]);
        return $this->errorResponse('Validation failed', 422, $e->errors());
    }

    /**
     * Standardized unauthorized response format.
     *
     * @param string $message
     * @return \Illuminate\Http\JsonResponse
     */
    protected function unauthorizedResponse($message = 'Forbidden')
    {
        return $this->errorResponse($message, 403);
    }

    /**
     * Standardized not found response format.
     *
     * @param string $resource
     * @return \Illuminate\Http\JsonResponse
     */
    protected function notFoundResponse($resource = 'Resource')
    {
        return $this->errorResponse("$resource not found", 404);
    }

    /**
     * Standardized server error response format.
     *
     * @param \Exception $e
     * @param string $customMessage
     * @return \Illuminate\Http\JsonResponse
     */
    protected function serverErrorResponse($e, $customMessage = 'An unexpected error occurred')
    {
        Log::error('Server error', ['error' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);
        return $this->errorResponse($customMessage, 500);
    }
}
