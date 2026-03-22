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
        $token = $request->bearerToken();
        if (!$token) return false;

        $user = User::where('api_token', hash('sha256', $token))->first();
        if (!$user) return false;

        // Owner or Admin roles have full access
        if (in_array($user->role, ['owner', 'admin'])) {
            return $user;
        }

        return false;
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
    protected function unauthorizedResponse($message = 'Unauthorized')
    {
        return $this->errorResponse($message, 401);
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
