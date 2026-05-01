<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Str;
use App\Http\Requests\StoreAddressRequest;

class AddressController extends Controller
{
    /**
     * Get authenticated user's addresses
     */
    public function index(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $addresses = $user->addresses ?? [];

        return response()->json([
            'success' => true,
            'addresses' => array_values($addresses),
        ]);
    }

    /**
     * Store a new address
     */
    public function store(StoreAddressRequest $request)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $validated = $request->validated();

        $addresses = $user->addresses ?? [];

        // If first address, set as default
        $isDefault = $validated['is_default'] ?? false;
        if (empty($addresses)) {
            $isDefault = true;
        }

        // If setting as default, unset all others
        if ($isDefault) {
            foreach ($addresses as &$addr) {
                $addr['is_default'] = false;
            }
        }

        $san = fn(?string $v) => $v !== null
            ? htmlspecialchars(strip_tags(trim($v)), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
            : '';

        $newAddress = [
            'id'           => Str::uuid()->toString(),
            'label'        => $san($validated['label'] ?? null),
            'house_number' => $san($validated['house_number']),
            'street'       => $san($validated['street']),
            'subdivision'  => $san($validated['subdivision'] ?? null),
            'barangay'     => $san($validated['barangay']),
            'city'         => $san($validated['city']),
            'province'     => $san($validated['province']),
            'zip'          => $validated['zip'],
            'phone'        => $validated['phone'],
            'is_default'   => $isDefault,
            'lat'          => isset($validated['lat']) ? (float) $validated['lat'] : null,
            'lng'          => isset($validated['lng']) ? (float) $validated['lng'] : null,
        ];

        $addresses[] = $newAddress;
        $user->addresses = $addresses;
        $user->save();

        return response()->json([
            'success' => true,
            'addresses' => array_values($user->addresses),
        ]);
    }

    /**
     * Update an existing address
     */
    public function update(StoreAddressRequest $request, string $id)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $addresses = $user->addresses ?? [];

        // Find address by id
        $index = null;
        foreach ($addresses as $i => $addr) {
            if ($addr['id'] === $id) {
                $index = $i;
                break;
            }
        }

        if ($index === null) {
            return response()->json([
                'success' => false,
                'message' => 'Address not found',
            ], 404);
        }

        $validated = $request->validated();

        $isDefault = $validated['is_default'] ?? false;

        // If setting as default, unset all others
        if ($isDefault) {
            foreach ($addresses as &$addr) {
                $addr['is_default'] = false;
            }
        }

        $san = fn(?string $v) => $v !== null
            ? htmlspecialchars(strip_tags(trim($v)), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
            : '';

        // Merge changes
        $addresses[$index] = array_merge($addresses[$index], [
            'label'        => $san($validated['label'] ?? null),
            'house_number' => $san($validated['house_number']),
            'street'       => $san($validated['street']),
            'subdivision'  => $san($validated['subdivision'] ?? null),
            'barangay'     => $san($validated['barangay']),
            'city'         => $san($validated['city']),
            'province'     => $san($validated['province']),
            'zip'          => $validated['zip'],
            'phone'        => $validated['phone'],
            'is_default'   => $isDefault,
            'lat'          => isset($validated['lat']) ? (float) $validated['lat'] : ($addresses[$index]['lat'] ?? null),
            'lng'          => isset($validated['lng']) ? (float) $validated['lng'] : ($addresses[$index]['lng'] ?? null),
        ]);

        $user->addresses = $addresses;
        $user->save();

        return response()->json([
            'success' => true,
            'addresses' => array_values($user->addresses),
        ]);
    }

    /**
     * Delete an address
     */
    public function destroy(Request $request, string $id)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $addresses = $user->addresses ?? [];

        // Find address by id
        $index = null;
        $deletedIsDefault = false;
        foreach ($addresses as $i => $addr) {
            if ($addr['id'] === $id) {
                $index = $i;
                $deletedIsDefault = $addr['is_default'] ?? false;
                break;
            }
        }

        if ($index === null) {
            return response()->json([
                'success' => false,
                'message' => 'Address not found',
            ], 404);
        }

        // Remove from array
        array_splice($addresses, $index, 1);

        // If deleted was default and others remain, auto-assign first as default
        if ($deletedIsDefault && !empty($addresses)) {
            $addresses[0]['is_default'] = true;
        }

        $user->addresses = $addresses;
        $user->save();

        return response()->json([
            'success' => true,
            'addresses' => array_values($user->addresses),
        ]);
    }

    /**
     * Set an address as default
     */
    public function setDefault(Request $request, string $id)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $addresses = $user->addresses ?? [];

        // Find address by id
        $index = null;
        foreach ($addresses as $i => $addr) {
            if ($addr['id'] === $id) {
                $index = $i;
                break;
            }
        }

        if ($index === null) {
            return response()->json([
                'success' => false,
                'message' => 'Address not found',
            ], 404);
        }

        // Unset is_default on all entries
        foreach ($addresses as &$addr) {
            $addr['is_default'] = false;
        }

        // Set is_default on matched entry
        $addresses[$index]['is_default'] = true;

        $user->addresses = $addresses;
        $user->save();

        return response()->json([
            'success' => true,
            'addresses' => array_values($user->addresses),
        ]);
    }
}
