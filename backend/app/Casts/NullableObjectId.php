<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use MongoDB\BSON\ObjectId;

/**
 * The package's ObjectId cast, minus its trap: it does `new ObjectId($value)` on whatever arrives,
 * and `new ObjectId(null)` does not fail - it MINTS a fresh id. Every save of a product with variants
 * (no top-level BOM, so bomId: null) therefore wrote a link to a BOM that never existed. Empty stays
 * empty here, and a string that is not an id is dropped rather than throwing mid-save.
 */
class NullableObjectId implements CastsAttributes
{
    public function get($model, string $key, $value, array $attributes)
    {
        return $value instanceof ObjectId ? (string) $value : $value;
    }

    public function set($model, string $key, $value, array $attributes)
    {
        if ($value instanceof ObjectId) return $value;
        if ($value === null || $value === '' || !is_string($value) || !preg_match('/^[a-f0-9]{24}$/i', $value)) return null;
        return new ObjectId($value);
    }
}
