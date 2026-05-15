<?php

namespace App\Http\Controllers;

use App\Models\Voucher;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use MongoDB\BSON\ObjectId;
use MongoDB\BSON\UTCDateTime;
use Throwable;

class VoucherController extends Controller
{
    // ── Helpers ────────────────────────────────────────────────────────────

    /** Safely converts any BSON/Carbon/string date to ISO 8601 string */
    private static function toDate($val): ?string
    {
        if ($val === null) return null;
        try {
            if ($val instanceof UTCDateTime) {
                return Carbon::instance($val->toDateTime())->toIso8601String();
            }
            if ($val instanceof Carbon) return $val->toIso8601String();
            if (is_string($val)) return $val;
            return null;
        } catch (Throwable $e) { return null; }
    }

    /** Converts a MongoDB model to a plain PHP array safe for json_encode */
    private static function serialize(Voucher $v): array
    {
        $raw = $v->getAttributes();   // raw BSON values, no Eloquent casting
        $id  = (string) $v->getKey();
        return [
            'id'                 => $id,
            '_id'                => $id,
            'code'               => (string) ($raw['code'] ?? ''),
            'benefitCategory'    => (string) ($raw['benefitCategory'] ?? 'monetary'),
            'benefitType'        => isset($raw['benefitType'])  ? (string) $raw['benefitType']  : null,
            'benefitDescription' => isset($raw['benefitDescription']) ? (string) $raw['benefitDescription'] : null,
            'discountType'       => isset($raw['discountType']) ? (string) $raw['discountType'] : null,
            'discountValue'      => isset($raw['discountValue'])  ? (float)  $raw['discountValue']  : null,
            'minOrderAmount'     => isset($raw['minOrderAmount']) ? (float)  $raw['minOrderAmount'] : null,
            'maxUses'            => isset($raw['maxUses'])  ? (int) $raw['maxUses']  : null,
            'usedCount'          => (int) ($raw['usedCount'] ?? 0),
            'isActive'           => (bool) ($raw['isActive'] ?? true),
            'expiresAt'          => self::toDate($raw['expiresAt'] ?? null),
            'createdAt'          => self::toDate($raw['createdAt'] ?? null),
        ];
    }

    // ── Admin: List all vouchers ────────────────────────────────────────────
    public function index(Request $request)
    {
        try {
            $limit  = min((int) $request->query('limit', 100), 200);
            $rows   = Voucher::orderBy('_id', 'desc')->limit($limit)->get();
            $data   = $rows->map(fn($v) => self::serialize($v))->values()->all();
            return response()->json(['data' => $data, 'total' => count($data)]);
        } catch (Throwable $e) {
            return response()->json([
                'message' => 'Failed to load vouchers: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ── Admin: Create voucher ───────────────────────────────────────────────
    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user) return response()->json(['message' => 'Unauthorized.'], 401);

        $v = Validator::make($request->all(), [
            'code'               => 'required|string|max:50',
            'benefitCategory'    => 'required|in:monetary,product,service,production,loyalty,experiential',
            'benefitType'        => 'required|string|max:50',
            'benefitDescription' => 'nullable|string|max:500',
            'discountType'       => 'nullable|in:percentage,fixed,tiered',
            'discountValue'      => 'nullable|numeric|min:0',
            'minOrderAmount'     => 'nullable|numeric|min:0',
            'maxUses'            => 'nullable|integer|min:1',
            'isActive'           => 'boolean',
            'expiresAt'          => 'nullable|date',
        ]);

        if ($v->fails()) {
            return response()->json(['message' => 'Validation failed.', 'errors' => $v->errors()], 422);
        }

        $validated = $v->validated();
        $code = strtoupper(trim($validated['code']));

        if (Voucher::where('code', $code)->exists()) {
            return response()->json(['message' => 'Voucher code already exists.'], 409);
        }

        if ($validated['benefitCategory'] === 'monetary') {
            if (empty($validated['discountType'])) {
                return response()->json(['message' => 'Discount type is required for monetary vouchers.'], 422);
            }
            if (empty($validated['discountValue']) || (float) $validated['discountValue'] <= 0) {
                return response()->json(['message' => 'Discount value must be greater than 0.'], 422);
            }
            if ($validated['discountType'] === 'percentage' && (float) $validated['discountValue'] >= 100) {
                return response()->json(['message' => 'Percentage discount must be less than 100%.'], 422);
            }
        }

        $now = now();
        $voucher = Voucher::create([
            'code'               => $code,
            'benefitCategory'    => $validated['benefitCategory'],
            'benefitType'        => $validated['benefitType'],
            'benefitDescription' => $validated['benefitDescription'] ?? null,
            'discountType'       => $validated['discountType'] ?? null,
            'discountValue'      => isset($validated['discountValue']) ? (float) $validated['discountValue'] : null,
            'minOrderAmount'     => isset($validated['minOrderAmount']) ? (float) $validated['minOrderAmount'] : null,
            'maxUses'            => isset($validated['maxUses']) ? (int) $validated['maxUses'] : null,
            'usedCount'          => 0,
            'usedBy'             => [],
            'isActive'           => $validated['isActive'] ?? true,
            'expiresAt'          => $validated['expiresAt'] ?? null,
            'createdBy'          => (string) $user->_id,
            'createdAt'          => $now,
            'updatedAt'          => $now,
        ]);

        return response()->json(['message' => 'Voucher created.', 'data' => self::serialize($voucher)], 201);
    }

    // ── Admin: Update voucher ───────────────────────────────────────────────
    public function update(Request $request, $id)
    {
        try {
        $user = $request->user();
        if (!$user) return response()->json(['message' => 'Unauthorized.'], 401);

        $voucher = Voucher::find($id);
        if (!$voucher) return response()->json(['message' => 'Voucher not found.'], 404);

        $v = Validator::make($request->all(), [
            'code'               => 'sometimes|string|max:50',
            'benefitCategory'    => 'sometimes|in:monetary,product,service,production,loyalty,experiential',
            'benefitType'        => 'sometimes|string|max:50',
            'benefitDescription' => 'nullable|string|max:500',
            'discountType'       => 'nullable|in:percentage,fixed,tiered',
            'discountValue'      => 'nullable|numeric|min:0',
            'minOrderAmount'     => 'nullable|numeric|min:0',
            'maxUses'            => 'nullable|integer|min:1',
            'isActive'           => 'boolean',
            'expiresAt'          => 'nullable|date',
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

        foreach (['benefitCategory', 'benefitType', 'discountType', 'isActive'] as $f) {
            if (isset($validated[$f])) $voucher->$f = $validated[$f];
        }
        foreach (['benefitDescription', 'minOrderAmount', 'discountValue', 'maxUses', 'expiresAt'] as $f) {
            if (array_key_exists($f, $validated)) {
                if ($validated[$f] === null) {
                    $voucher->$f = null;
                } elseif (in_array($f, ['minOrderAmount', 'discountValue'])) {
                    $voucher->$f = (float) $validated[$f];
                } elseif ($f === 'maxUses') {
                    $voucher->$f = (int) $validated[$f];
                } else {
                    $voucher->$f = $validated[$f];
                }
            }
        }

        $voucher->updatedAt = now();
        $voucher->save();

        return response()->json(['message' => 'Voucher updated.', 'data' => self::serialize($voucher)]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Failed to update voucher: ' . $e->getMessage()], 500);
        }
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
        try {
            $voucher = Voucher::find($id);
            if (!$voucher) return response()->json(['message' => 'Voucher not found.'], 404);
            $voucher->isActive  = !((bool) ($voucher->getAttributes()['isActive'] ?? true));
            $voucher->updatedAt = now();
            $voucher->save();
            return response()->json(['message' => 'Voucher toggled.', 'data' => self::serialize($voucher)]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Failed to toggle voucher: ' . $e->getMessage()], 500);
        }
    }

    // ── Customer: Apply/preview a voucher code ──────────────────────────────
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
        if (!$user) return response()->json(['message' => 'Unauthorized.'], 401);

        $code     = strtoupper(trim($request->input('code')));
        $subtotal = (float) $request->input('subtotal');
        $userId   = (string) $user->_id;

        $voucher = Voucher::where('code', $code)->first();
        if (!$voucher) return response()->json(['message' => 'Invalid voucher code.'], 404);

        $raw = $voucher->getAttributes();

        if (!((bool) ($raw['isActive'] ?? true))) {
            return response()->json(['message' => 'This voucher is inactive.'], 422);
        }

        $expiresAt = $raw['expiresAt'] ?? null;
        if ($expiresAt !== null) {
            $expCarbon = $expiresAt instanceof UTCDateTime
                ? Carbon::instance($expiresAt->toDateTime())
                : Carbon::parse($expiresAt);
            if ($expCarbon->isPast()) {
                return response()->json(['message' => 'This voucher has expired.'], 422);
            }
        }

        $maxUses  = isset($raw['maxUses'])  ? (int) $raw['maxUses']  : null;
        $usedCount = (int) ($raw['usedCount'] ?? 0);
        if ($maxUses !== null && $usedCount >= $maxUses) {
            return response()->json(['message' => 'This voucher has reached its usage limit.'], 422);
        }

        $usedBy = [];
        if (isset($raw['usedBy'])) {
            $usedBy = is_array($raw['usedBy']) ? $raw['usedBy'] : iterator_to_array($raw['usedBy']);
            $usedBy = array_map('strval', $usedBy);
        }
        if (in_array($userId, $usedBy, true)) {
            return response()->json(['message' => 'You have already used this voucher.'], 422);
        }

        $minOrder = isset($raw['minOrderAmount']) ? (float) $raw['minOrderAmount'] : null;
        if ($minOrder !== null && $subtotal < $minOrder) {
            return response()->json([
                'message' => 'Minimum order of ₱' . number_format($minOrder, 2) . ' required for this voucher.',
            ], 422);
        }

        $benefitCategory = (string) ($raw['benefitCategory'] ?? 'monetary');
        $isMonetary      = $benefitCategory === 'monetary';
        $discountAmount  = 0.0;

        if ($isMonetary) {
            $dtype = $raw['discountType'] ?? null;
            $dval  = isset($raw['discountValue']) ? (float) $raw['discountValue'] : 0.0;
            if ($dtype === 'percentage') {
                $discountAmount = round($subtotal * $dval / 100, 2);
            } elseif ($dtype === 'fixed' || $dtype === 'tiered') {
                $discountAmount = min($dval, $subtotal);
            }
        }

        return response()->json([
            'message' => 'Voucher applied.',
            'data'    => [
                'code'               => (string) ($raw['code'] ?? $code),
                'benefitCategory'    => $benefitCategory,
                'benefitType'        => isset($raw['benefitType'])        ? (string) $raw['benefitType']        : null,
                'benefitDescription' => isset($raw['benefitDescription']) ? (string) $raw['benefitDescription'] : null,
                'discountType'       => isset($raw['discountType'])       ? (string) $raw['discountType']       : null,
                'discountValue'      => isset($raw['discountValue'])      ? (float)  $raw['discountValue']      : null,
                'discountAmount'     => $discountAmount,
                'isMonetary'         => $isMonetary,
            ],
        ]);
    }
}
