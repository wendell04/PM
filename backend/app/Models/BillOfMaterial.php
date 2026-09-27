<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;
use MongoDB\Laravel\Eloquent\Casts\ObjectId;

class BillOfMaterial extends Model
{
    // Every create, change and delete by a signed-in person lands in the audit trail.
    use \App\Models\Concerns\Auditable;
    protected string $auditEntity = 'bom';
    protected string $auditNoun = 'BOM';
    protected array $auditIgnore = ['totalCost'];

    protected $connection = 'mongodb';
    protected $collection = 'bill_of_materials';

    protected $fillable = [
        'sku',
        'productName',
        'productGroupName',
        'variantName',
        'variantCombo',
        'components',
        'totalCost',
        'isActive',
        'createdAt',
        'updatedAt',
    ];

    /**
     * The audit's words for a recipe change. "Components: 4 entries -> 4 entries" tells nobody that
     * the ink went from 2 to 3 per piece, which is the line a costing question needs.
     */
    public function auditDescribe(string $key, $old, $new): ?string
    {
        if ($key !== 'components') return null;
        $index = function ($list) {
            $out = [];
            foreach ((array) $list as $c) {
                $c = (array) $c;
                $name = trim((string) ($c['materialName'] ?? '')) ?: (string) ($c['inventoryId'] ?? '?');
                $out[$name] = (0 + ($c['qty'] ?? 0)) . ' ' . trim((string) ($c['unit'] ?? ''));
            }
            return $out;
        };
        [$a, $b] = [$index($old), $index($new)];
        $bits = [];
        foreach ($b as $n => $q) {
            if (!isset($a[$n]))     $bits[] = "added {$n} ({$q})";
            elseif ($a[$n] !== $q)  $bits[] = "{$n} {$a[$n]} -> {$q}";
        }
        foreach ($a as $n => $q) if (!isset($b[$n])) $bits[] = "removed {$n}";
        return $bits ? implode(', ', $bits) : null;
    }

    // components shape:
    // [{ inventoryId: ObjectId, materialName: string, qty: float, unit: string, unitCost: float }]

    protected $casts = [
        'totalCost'  => 'float',
        'isActive'   => 'boolean',
        'createdAt'  => 'datetime',
        'updatedAt'  => 'datetime',
    ];

    protected $indexes = [
        ['key' => ['productGroupName' => 1]],
        ['key' => ['sku'              => 1], 'unique' => true],
        ['key' => ['isActive'         => 1]],
    ];

    protected $attributes = [
        'isActive'   => true,
        'totalCost'  => 0,
        'components' => [],
    ];

    public function scopeActive($query)
    {
        return $query->where('isActive', true);
    }

    public function scopeByProductGroup($query, string $group)
    {
        return $query->where('productGroupName', $group);
    }
}
