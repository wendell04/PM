<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use App\Models\User;

class StaffController extends Controller
{
    private function getStaffRoles(): array
    {
        return \App\Models\RolePermission::pluck('role')->toArray();
    }

    /**
     * GET /api/admin/staff
     * List all staff accounts (excludes customers).
     */
    public function index(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'userManagement')) {
                return $this->unauthorizedResponse();
            }

            $staff = User::where('role', '!=', 'customer')
                ->get(['_id', 'firstName', 'lastName', 'email', 'role', 'is_verified', 'lastLogin', 'avatar', 'promotedFromCustomer']);

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
            if (!$this->hasPermission($request, 'userManagement')) {
                return $this->unauthorizedResponse();
            }

            // The store owner's account is made here too, by a Super Admin only - it is not a row in the
            // permission grid, so it is offered on top of the grid's roles. canAssignRole below is what
            // actually refuses anyone else.
            $assignable = $this->getStaffRoles();
            if (\App\Support\Rbac::isSuperAdmin($request->user())) {
                $assignable[] = config('rbac.owner_role', 'owner');
            }

            $validated = $request->validate([
                'firstName' => 'required|string|max:100',
                'lastName'  => 'required|string|max:100',
                'email'     => 'required|email',
                'password'  => 'nullable|string|min:8|max:255',
                'role'      => 'required|string|in:' . implode(',', $assignable),
            ]);
            $makingOwner = $validated['role'] === config('rbac.owner_role', 'owner');

            // Escalation guard: cannot create an account at or above your own level.
            if (!\App\Support\Rbac::canAssignRole($request->user(), $validated['role'])) {
                return $this->errorResponse('You cannot assign a role at or above your own level.', 403);
            }

            $existing = User::emailIs($validated['email'])->first();
            if ($existing && ($existing->role ?? 'customer') !== 'customer') {
                $msg = 'This email is already a staff account.';
                return response()->json(['success' => false, 'message' => $msg, 'errors' => ['email' => [$msg]]], 422);
            }

            // An Owner account cannot shop (the cart is switched off for it), so turning someone's
            // customer account into the Owner would strand their cart and orders. The owner's business
            // login is its own account.
            if ($existing && $makingOwner) {
                $msg = 'This email already shops here. The Owner login cannot shop, so use a separate email for it - for example the store\'s business email.';
                return response()->json(['success' => false, 'message' => $msg, 'errors' => ['email' => [$msg]]], 422);
            }

            // Someone who already shops here can be given staff access on that same account - the way
            // a shop manager in WooCommerce still orders as themselves. Asked first, because it opens
            // the dashboard to an account the owner did not create: they keep their own password, name
            // and orders, and removing them from staff later hands the account back as a customer.
            if ($existing) {
                if (!$request->boolean('promoteExisting')) {
                    $name = trim(($existing->firstName ?? '') . ' ' . ($existing->lastName ?? '')) ?: $existing->email;
                    return response()->json([
                        'success' => false,
                        'code'    => 'customer_account',
                        'name'    => $name,
                        'message' => "{$name} already shops with this email. Make that same account a staff account? "
                            . 'They keep their own password and orders, can still shop, and get a Dashboard link. '
                            . 'Removing them from staff later turns it back into a customer account.',
                    ], 409);
                }
                if (!($existing->is_verified ?? false)) {
                    return $this->errorResponse('That customer has not verified their email yet. Ask them to finish signing up first.', 422);
                }

                $existing->role                 = $validated['role'];
                $existing->promotedFromCustomer = true;
                $existing->staffSince           = now();
                $existing->save();

                $this->logActivity(
                    $request, 'user.role_changed', 'user', (string) $existing->_id,
                    "Gave customer {$existing->email} staff access as {$existing->role}",
                    ['email' => $existing->email, 'from' => 'customer', 'to' => $existing->role]
                );

                return $this->successResponse('Customer account is now a staff account.', [
                    '_id'       => (string) $existing->_id,
                    'firstName' => $existing->firstName,
                    'lastName'  => $existing->lastName,
                    'email'     => $existing->email,
                    'role'      => $existing->role,
                ], 201);
            }

            if (empty($validated['password'])) {
                $msg = 'Set a password of at least 8 characters for the new staff account.';
                return response()->json(['success' => false, 'message' => $msg, 'errors' => ['password' => [$msg]]], 422);
            }

            $staff = User::create([
                'firstName'    => $validated['firstName'],
                'lastName'     => $validated['lastName'],
                'email'        => $validated['email'],
                'password'     => Hash::make($validated['password']),
                'role'         => $validated['role'],
                'is_verified'  => true, // Admin-created accounts skip verification
                'phoneNumber'  => $request->input('phoneNumber', ''),
            ]);

            $this->logActivity(
                $request, $makingOwner ? 'user.owner_created' : 'user.created', 'user', (string) $staff->_id,
                $makingOwner ? "Created the Owner account {$staff->email}" : "Created staff {$staff->email} with role {$staff->role}",
                ['email' => $staff->email, 'role' => $staff->role]
            );

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
            if (!$this->hasPermission($request, 'userManagement')) {
                return $this->unauthorizedResponse();
            }

            $staff = User::find($id);
            if (!$staff) return $this->notFoundResponse('Staff');

            // Prevent modifying protected system/business accounts (Super Admin / Owner)
            if (\App\Support\Rbac::isSuperAdmin($staff) || \App\Support\Rbac::isOwner($staff)) {
                return $this->errorResponse('Cannot modify Super Admin or Owner accounts.', 403);
            }

            // Escalation guard: cannot manage an account at or above your own level
            // (blocks self-edits too, since a role can never outrank itself).
            if (\App\Support\Rbac::rank($request->user()->role) <= \App\Support\Rbac::rank($staff->role)) {
                return $this->errorResponse('You cannot modify an account at or above your own level.', 403);
            }

            $validated = $request->validate([
                'firstName' => 'sometimes|string|max:100',
                'lastName'  => 'sometimes|string|max:100',
                'role'      => 'sometimes|string|in:' . implode(',', $this->getStaffRoles()),
                'password'  => 'sometimes|string|min:8|max:255',
            ]);

            // Escalation guard: cannot promote a user into a role at or above your own level.
            if (isset($validated['role']) && !\App\Support\Rbac::canAssignRole($request->user(), $validated['role'])) {
                return $this->errorResponse('You cannot assign a role at or above your own level.', 403);
            }

            $oldRole = $staff->role;
            if (isset($validated['firstName'])) $staff->firstName = $validated['firstName'];
            if (isset($validated['lastName']))  $staff->lastName  = $validated['lastName'];
            if (isset($validated['role']))      $staff->role      = $validated['role'];
            // A customer given staff access signs in with the password they chose for themselves.
            if (isset($validated['password']) && ($staff->promotedFromCustomer ?? false)) {
                return $this->errorResponse('This person uses their own customer account. They change their password themselves.', 422);
            }
            if (isset($validated['password']))  $staff->password  = Hash::make($validated['password']);

            $staff->save();

            if (isset($validated['role']) && $validated['role'] !== $oldRole) {
                $this->logActivity(
                    $request, 'user.role_changed', 'user', (string) $staff->_id,
                    "Changed {$staff->email} role: {$oldRole} → {$staff->role}",
                    ['email' => $staff->email, 'from' => $oldRole, 'to' => $staff->role]
                );
            } else {
                $this->logActivity(
                    $request, 'user.updated', 'user', (string) $staff->_id,
                    "Updated staff account {$staff->email}",
                    ['email' => $staff->email]
                );
            }

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
            if (!$this->hasPermission($request, 'userManagement')) {
                return $this->unauthorizedResponse();
            }

            $staff = User::find($id);
            if (!$staff) return $this->notFoundResponse('Staff');

            // An Owner is protected - except from a Super Admin before that Owner has ever signed in,
            // so a mistyped email can be fixed. Once the owner is using it, it is theirs.
            $unusedOwner = \App\Support\Rbac::isOwner($staff)
                && empty($staff->lastLogin) && empty($staff->last_login_at)
                && \App\Support\Rbac::isSuperAdmin($request->user());
            if (\App\Support\Rbac::isSuperAdmin($staff) || (\App\Support\Rbac::isOwner($staff) && !$unusedOwner)) {
                return $this->errorResponse(\App\Support\Rbac::isOwner($staff)
                    ? 'The Owner account has been used, so it cannot be deleted here.'
                    : 'Cannot delete Super Admin accounts.', 403);
            }

            // Prevent self-deletion
            if ((string) $staff->_id === (string) $request->user()->_id) {
                return $this->errorResponse('Cannot delete your own account.', 403);
            }

            // A customer who was given staff access goes back to being a customer - deleting them would
            // take their own account and order history with the job. The same for any staff login that
            // has placed orders.
            $hasOrders = \App\Models\Order::where('userId', (string) $staff->_id)->exists();
            if (($staff->promotedFromCustomer ?? false) || $hasOrders) {
                $oldRole                     = $staff->role;
                $staff->role                 = 'customer';
                $staff->promotedFromCustomer = null;
                $staff->staffSince           = null;
                $staff->save();
                // Signed out everywhere, so no open tab keeps showing a dashboard they can no longer use.
                $staff->tokens()->delete();

                $this->logActivity(
                    $request, 'user.role_changed', 'user', (string) $staff->_id,
                    "Removed {$staff->email} from staff ({$oldRole}); kept as a customer",
                    ['email' => $staff->email, 'from' => $oldRole, 'to' => 'customer']
                );
                return $this->successResponse('Removed from staff. Their customer account and orders are kept.');
            }

            $deletedEmail = $staff->email;
            $deletedRole  = $staff->role;
            $deletedId    = (string) $staff->_id;
            $staff->delete();

            $this->logActivity(
                $request, 'user.deleted', 'user', $deletedId,
                "Deleted staff {$deletedEmail} ({$deletedRole})",
                ['email' => $deletedEmail, 'role' => $deletedRole]
            );

            return $this->successResponse('Staff account deleted successfully.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to delete staff account.');
        }
    }

    /**
     * GET /api/admin/customers
     * List all customer accounts.
     */
    public function customers(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'userManagement')) {
                return $this->unauthorizedResponse();
            }

            $customers = User::where('role', 'customer')
                ->orderBy('created_at', 'desc')
                ->get(['_id', 'firstName', 'lastName', 'email', 'avatar', 'is_verified',
                       'login_locked_until', 'failed_login_attempts', 'unlock_requested_at', 'created_at',
                       // Clickwrap evidence. Recorded at registration and never edited afterwards, so
                       // it is the only thing that can answer "what exactly did they agree to".
                       'acceptedTermsVersion', 'acceptedTermsAt', 'acceptedTermsSnapshot', 'acceptedTermsIp',
                       // Recorded at every login but never surfaced. "Joined" answers when someone
                       // arrived; only this answers whether they are still here.
                       'acceptedTermsLegacy', 'last_login_at']);

            $now = now();
            $result = $customers->map(fn($u) => [
                'id'                    => (string) $u->_id,
                'firstName'             => $u->firstName ?? '',
                'lastName'              => $u->lastName ?? '',
                'email'                 => $u->email,
                'avatar'                => $u->avatar,
                'is_verified'           => (bool) ($u->is_verified ?? false),
                'is_locked'             => $u->login_locked_until && $u->login_locked_until > $now,
                'failed_login_attempts' => (int) ($u->failed_login_attempts ?? 0),
                'unlock_requested_at'   => $u->unlock_requested_at?->toIso8601String(),
                'created_at'            => $u->created_at?->toIso8601String(),
                'acceptedTermsVersion'  => $u->acceptedTermsVersion !== null ? (int) $u->acceptedTermsVersion : null,
                'acceptedTermsAt'       => $u->acceptedTermsAt ?? null,
                'acceptedTermsSnapshot' => $u->acceptedTermsSnapshot ?? null,
                'acceptedTermsIp'       => $u->acceptedTermsIp ?? null,
                'acceptedTermsLegacy'   => (bool) ($u->acceptedTermsLegacy ?? false),
                'last_login_at'         => $u->last_login_at?->toIso8601String(),
            ]);

            return $this->successResponse('Customers fetched.', $result);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch customers.');
        }
    }

    /**
     * POST /api/admin/customers/{id}/unlock
     * Directly unlock a customer account (admin action without request flow).
     */
    public function unlockCustomer(Request $request, string $id)
    {
        try {
            if (!$this->hasPermission($request, 'userManagement')) {
                return $this->unauthorizedResponse();
            }

            $user = User::find($id);
            if (!$user || $user->role !== 'customer') {
                return $this->notFoundResponse('User');
            }

            $user->login_locked_until    = null;
            $user->failed_login_attempts = 0;
            $user->unlock_requested_at   = null;
            $user->save();

            return $this->successResponse('Account unlocked successfully.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to unlock account.');
        }
    }

    /**
     * GET /api/admin/unlock-requests
     * List customers who have requested account unlock.
     */
    public function unlockRequests(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'userManagement')) {
                return $this->unauthorizedResponse();
            }

            $users = User::where('role', 'customer')
                ->whereNotNull('unlock_requested_at')
                ->get(['_id', 'firstName', 'lastName', 'email', 'login_locked_until', 'unlock_requested_at']);

            $result = $users->map(fn($u) => [
                'id'                  => (string) $u->_id,
                'name'                => trim(($u->firstName ?? '') . ' ' . ($u->lastName ?? '')),
                'email'               => $u->email,
                'login_locked_until'  => $u->login_locked_until?->toIso8601String(),
                'unlock_requested_at' => $u->unlock_requested_at?->toIso8601String(),
            ]);

            return $this->successResponse('Unlock requests fetched.', $result);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch unlock requests.');
        }
    }

    /**
     * POST /api/admin/unlock-requests/{id}/approve
     * Approve a customer unlock request.
     */
    public function approveUnlock(Request $request, string $id)
    {
        try {
            if (!$this->hasPermission($request, 'userManagement')) {
                return $this->unauthorizedResponse();
            }

            $user = User::find($id);
            if (!$user || $user->role !== 'customer') {
                return $this->notFoundResponse('User');
            }

            $user->login_locked_until    = null;
            $user->failed_login_attempts = 0;
            $user->unlock_requested_at   = null;
            $user->save();

            return $this->successResponse('Account unlocked successfully.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to unlock account.');
        }
    }

    /**
     * POST /api/admin/unlock-requests/{id}/deny
     * Deny a customer unlock request (clears the flag without unlocking).
     */
    public function denyUnlock(Request $request, string $id)
    {
        try {
            if (!$this->hasPermission($request, 'userManagement')) {
                return $this->unauthorizedResponse();
            }

            $user = User::find($id);
            if (!$user || $user->role !== 'customer') {
                return $this->notFoundResponse('User');
            }

            $user->unlock_requested_at = null;
            $user->save();

            return $this->successResponse('Unlock request denied.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to deny unlock request.');
        }
    }
}
