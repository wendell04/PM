<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;

/**
 * An array cast that tolerates both storage shapes found in these collections.
 *
 * MongoDB stores arrays and sub-documents natively, but Laravel's built-in 'array' cast assumes the
 * value was serialised to a JSON string and calls json_decode() on it unconditionally. A collection
 * written through both paths - some documents holding a native array, others a JSON string - makes
 * the built-in cast throw a TypeError the moment it meets the native form. That is not a contained
 * failure: it breaks serialising the whole model, so a single such document takes down every list it
 * appears in. That is exactly what "Failed to fetch job orders" was.
 *
 * Reading accepts a native array, a BSON document, a JSON string, or nothing. Writing always stores
 * the encoded form, so anything saved from here on is consistent.
 */
class FlexibleArray implements CastsAttributes
{
    public function get($model, string $key, $value, array $attributes)
    {
        if ($value === null || $value === '') {
            return [];
        }
        if (is_array($value)) {
            return $value;
        }
        if (is_object($value)) {
            // BSONDocument / BSONArray and friends.
            return json_decode(json_encode($value), true) ?? [];
        }
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }

    public function set($model, string $key, $value, array $attributes)
    {
        if ($value === null) {
            return [$key => null];
        }
        return [$key => is_string($value) ? $value : json_encode($value)];
    }
}
