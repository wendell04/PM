<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use App\Models\User;

class StaffController extends Controller
{
    protected array $staffRoles = [
        'salesRep',
        'productionOperator',
        'qualityControl',
        'cashier',
        'inventoryManager',
    ];

    /**
     * GET /api/admin/staff
     * List all staff accounts (excludes customers).
     */
    public function index(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $staff = User::whereIn('role', array_merge(['admin', 'owner'], $this->staffRoles))
                ->get(['_id', 'firstName', 'lastName', 'email', 'role', 'is_verified', 'lastLogin', 'avatar']);

            return $this->successResponse('Staff fetched successfully.', $staff);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch staff.');
        }
    }

    /**
     * POST /api/admin/staff
     * Create a new staff account. Admin/owner only.
     */
    public function store(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'firstName' => 'required|string|max:100',
                'lastName'  => 'required|string|max:100',
                'email'     => 'required|email|unique:users,email',
                'password'  => 'required|string|min:8',
                'role'      => 'required|string|in:' . implode(',', $this->staffRoles),
            ]);

            $staff = User::create([
                'firstName'    => $validated['firstName'],
                'lastName'     => $validated['lastName'],
                'email'        => $validated['email'],
                'password'     => Hash::make($validated['password']),
                'role'         => $validated['role'],
                'is_verified'  => true, // Admin-created accounts skip verification
                'phoneNumber'  => $request->input('phoneNumber', ''),
            ]);

            return $this->successResponse('Staff account created successfully.', [
                '_id'       => (string) $staff->_id,
                'firstName' => $staff->firstName,
                'lastName'  => $staff->lastName,
                'email'     => $staff->email,
                'role'      => $staff->role,
            ], 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to create staff account.');
        }
    }

    /**
     * PUT /api/admin/staff/{id}
     * Update staff role or basic info. Admin/owner only.
     */
    public function update(Request $request, string $id)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $staff = User::find($id);
            if (!$staff) return $this->notFoundResponse('Staff');

            // Prevent modifying admin/owner accounts
            if (in_array($staff->role, ['admin', 'owner'])) {
                return $this->errorResponse('Cannot modify admin or owner accounts.', 403);
            }

            $validated = $request->validate([
                'firstName' => 'sometimes|string|max:100',
                'lastName'  => 'sometimes|string|max:100',
                'role'      => 'sometimes|string|in:' . implode(',', $this->staffRoles),
                'password'  => 'sometimes|string|min:8',
            ]);

            if (isset($validated['firstName'])) $staff->firstName = $validated['firstName'];
            if (isset($validated['lastName']))  $staff->lastName  = $validated['lastName'];
            if (isset($validated['role']))      $staff->role      = $validated['role'];
            if (isset($validated['password']))  $staff->password  = Hash::make($validated['password']);

            $staff->save();

            return $this->successResponse('Staff account updated successfully.', [
                '_id'       => (string) $staff->_id,
                'firstName' => $staff->firstName,
                'lastName'  => $staff->lastName,
                'email'     => $staff->email,
                'role'      => $staff->role,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to update staff account.');
        }
    }

    /**
     * DELETE /api/admin/staff/{id}
     * Deactivate (delete) a staff account. Admin/owner only.
     * Cannot delete admin/owner accounts.
     */
    public function destroy(Request $request, string $id)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $staff = User::find($id);
            if (!$staff) return $this->notFoundResponse('Staff');

            if (in_array($staff->role, ['admin', 'owner'])) {
                return $this->errorResponse('Cannot delete admin or owner accounts.', 403);
            }

            // Prevent self-deletion
            if ((string) $staff->_id === (string) $request->user()->_id) {
                return $this->errorResponse('Cannot delete your own account.', 403);
            }

            $staff->delete();

            return $this->successResponse('Staff account deleted successfully.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to delete staff account.');
        }
    }
}
