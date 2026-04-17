<?php

namespace App\Http\Controllers;

use App\Models\Voucher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class VoucherController extends Controller
{
    // ── Admin: List all vouchers ────────────────────────────────────────────
    public function index(Request $request)
    {
        $limit    = min((int) $request->query('limit', 100), 200);
        $vouchers = Voucher::orderBy('createdAt', 'desc')->limit($limit)->get();
        return response()->json(['data' => $vouchers, 'total' => $vouchers->count()]);
    }

    // ── Admin: Create voucher ───────────────────────────────────────────────
    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user) return response()->json(['message' => 'Unauthorized.'], 401);

        $v = Validator::make($request->all(), [
            'code'           => 'required|string|max:50',
            'discountType'   => 'required|in:percentage,fixed',
            'discountValue'  => 'required|numeric|min:0.01',
            'minOrderAmount' => 'nullable|numeric|min:0',
            'maxUses'        => 'nullable|integer|min:1',
            'isActive'       => 'boolean',
            'expiresAt'      => 'nullable|date',
        ]);

        if ($v->fails()) {
            return response()->json(['message' => 'Validation failed.', 'errors' => $v->errors()], 422);
        }

        $validated = $v->validated();

        // Enforce uppercase unique code
        $code = strtoupper(trim($validated['code']));
        if (Voucher::where('code', $code)->exists()) {
            return response()->json(['message' => 'Voucher code already exists.'], 409);
        }

        if ($validated['discountType'] === 'percentage' && $validated['discountValue'] >= 100) {
            return response()->json(['message' => 'Percentage discount must be less than 100%.'], 422);
        }

        $voucher = Voucher::create([
            'code'           => $code,
            'discountType'   => $validated['discountType'],
            'discountValue'  => (float) $validated['discountValue'],
            'minOrderAmount' => isset($validated['minOrderAmount']) ? (float) $validated['minOrderAmount'] : null,
            'maxUses'        => isset($validated['maxUses']) ? (int) $validated['maxUses'] : null,
            'usedCount'      => 0,
            'isActive'       => $validated['isActive'] ?? true,
            'expiresAt'      => isset($validated['expiresAt']) ? $validated['expiresAt'] : null,
            'createdBy'      => (string) $user->_id,
            'createdAt'      => now(),
            'updatedAt'      => now(),
        ]);

        return response()->json(['message' => 'Voucher created.', 'data' => $voucher], 201);
    }

    // ── Admin: Update voucher ───────────────────────────────────────────────
    public function update(Request $request, $id)
    {
        $user = $request->user();
        if (!$user) return response()->json(['message' => 'Unauthorized.'], 401);

        $voucher = Voucher::find($id);
        if (!$voucher) return response()->json(['message' => 'Voucher not found.'], 404);

        $v = Validator::make($request->all(), [
            'code'           => 'sometimes|string|max:50',
            'discountType'   => 'sometimes|in:percentage,fixed',
            'discountValue'  => 'sometimes|numeric|min:0.01',
            'minOrderAmount' => 'nullable|numeric|min:0',
            'maxUses'        => 'nullable|integer|min:1',
            'isActive'       => 'boolean',
            'expiresAt'      => 'nullable|date',
        ]);

        if ($v->fails()) {
            return response()->json(['message' => 'Validation failed.', 'errors' => $v->errors()], 422);
        }

        $validated = $v->validated();

        if (isset($validated['code'])) {
            $code = strtoupper(trim($validated['code']));
            if (Voucher::where('code', $code)->where('_id', '!=', $id)->exists()) {
                return response()->json(['message' => 'Voucher code already exists.'], 409);
            }
            $voucher->code = $code;
        }

        if (isset($validated['discountType']))   $voucher->discountType   = $validated['discountType'];
        if (isset($validated['discountValue']))  $voucher->discountValue  = (float) $validated['discountValue'];
        if (array_key_exists('minOrderAmount', $validated)) $voucher->minOrderAmount = $validated['minOrderAmount'] !== null ? (float) $validated['minOrderAmount'] : null;
        if (array_key_exists('maxUses', $validated))        $voucher->maxUses        = $validated['maxUses'] !== null ? (int) $validated['maxUses'] : null;
        if (isset($validated['isActive']))       $voucher->isActive       = (bool) $validated['isActive'];
        if (array_key_exists('expiresAt', $validated))      $voucher->expiresAt      = $validated['expiresAt'];

        $voucher->updatedAt = now();
        $voucher->save();

        return response()->json(['message' => 'Voucher updated.', 'data' => $voucher]);
    }

    // ── Admin: Delete voucher ───────────────────────────────────────────────
    public function destroy($id)
    {
        $voucher = Voucher::find($id);
        if (!$voucher) return response()->json(['message' => 'Voucher not found.'], 404);
        $voucher->delete();
        return response()->json(['message' => 'Voucher deleted.']);
    }

    // ── Admin: Toggle isActive ──────────────────────────────────────────────
    public function toggle($id)
    {
        $voucher = Voucher::find($id);
        if (!$voucher) return response()->json(['message' => 'Voucher not found.'], 404);
        $voucher->isActive  = !$voucher->isActive;
        $voucher->updatedAt = now();
        $voucher->save();
        return response()->json(['message' => 'Voucher toggled.', 'data' => $voucher]);
    }

    // ── Customer: Apply/preview a voucher code ──────────────────────────────
    // POST /api/vouchers/apply  { code, subtotal }
    public function apply(Request $request)
    {
        $v = Validator::make($request->all(), [
            'code'     => 'required|string|max:50',
            'subtotal' => 'required|numeric|min:0',
        ]);

        if ($v->fails()) {
            return response()->json(['message' => 'Validation failed.', 'errors' => $v->errors()], 422);
        }

        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $code     = strtoupper(trim($request->input('code')));
        $subtotal = (float) $request->input('subtotal');
        $userId   = (string) $user->_id;

        $voucher = Voucher::where('code', $code)->first();

        if (!$voucher) {
            return response()->json(['message' => 'Invalid voucher code.'], 404);
        }
        if (!$voucher->isActive) {
            return response()->json(['message' => 'This voucher is inactive.'], 422);
        }
        if ($voucher->expiresAt && $voucher->expiresAt < now()) {
            return response()->json(['message' => 'This voucher has expired.'], 422);
        }
        if ($voucher->maxUses !== null && $voucher->usedCount >= $voucher->maxUses) {
            return response()->json(['message' => 'This voucher has reached its usage limit.'], 422);
        }
        $usedBy = $voucher->usedBy ?? [];
        if (in_array($userId, $usedBy, true)) {
            return response()->json(['message' => 'You have already used this voucher.'], 422);
        }
        if ($voucher->minOrderAmount !== null && $subtotal < $voucher->minOrderAmount) {
            return response()->json([
                'message' => "Minimum order of ₱" . number_format($voucher->minOrderAmount, 2) . " required for this voucher.",
            ], 422);
        }

        $discountAmount = $voucher->discountType === 'percentage'
            ? round($subtotal * $voucher->discountValue / 100, 2)
            : min((float) $voucher->discountValue, $subtotal);

        return response()->json([
            'message'        => 'Voucher applied.',
            'data'           => [
                'code'           => $voucher->code,
                'discountType'   => $voucher->discountType,
                'discountValue'  => $voucher->discountValue,
                'discountAmount' => $discountAmount,
            ],
        ]);
    }
}

