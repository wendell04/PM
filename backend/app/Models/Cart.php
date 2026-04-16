<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Cart extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'carts';

    protected $fillable = [
        'userId',
        'items',
        'updatedAt',
    ];

    protected $casts = [
        'items' => 'array',
        'updatedAt' => 'datetime',
    ];

    protected $indexes = [
        ['key' => ['userId' => 1], 'unique' => true],
    ];

    protected $attributes = [
        'items' => [],
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'userId');
    }

    /**
     * Get cart by user ID
     */
    public static function getByUserId($userId)
    {
        return static::where('userId', $userId)->first();
    }

    /**
     * Add or update item in cart
     */
    public function addItem($productId, $productName, $qty, $unitPrice, $lineTotal, $variantId = null, $variantName = null, $image = null)
    {
        $items = $this->items ?? [];
        
        // Find existing item with same productId and variantId
        $existingIndex = null;
        foreach ($items as $index => $item) {
            if ($item['productId'] === $productId && 
                ($item['variantId'] ?? null) === ($variantId ?? null)) {
                $existingIndex = $index;
                break;
            }
        }

        if ($existingIndex !== null) {
            // Update existing item quantity
            $items[$existingIndex]['qty'] += $qty;
            $items[$existingIndex]['lineTotal'] = $items[$existingIndex]['qty'] * $items[$existingIndex]['unitPrice'];
        } else {
            // Add new item
            $items[] = [
                'productId' => $productId,
                'productName' => $productName,
                'variantId' => $variantId,
                'variantName' => $variantName,
                'qty' => $qty,
                'unitPrice' => $unitPrice,
                'lineTotal' => $lineTotal,
                'image' => $image,
            ];
        }

        $this->items = $items;
        $this->updatedAt = now();
        $this->save();

        return $this;
    }

    /**
     * Remove item from cart
     */
    public function removeItem($productId, $variantId = null)
    {
        $items = $this->items ?? [];
        
        $items = array_filter($items, function($item) use ($productId, $variantId) {
            if ($variantId === null) {
                return $item['productId'] !== $productId;
            }
            return $item['productId'] !== $productId || ($item['variantId'] ?? null) !== $variantId;
        });

        $this->items = array_values($items); // Re-index array
        $this->updatedAt = now();
        $this->save();

        return $this;
    }

    /**
     * Clear all items from cart
     */
    public function clear()
    {
        $this->items = [];
        $this->updatedAt = now();
        $this->save();

        return $this;
    }

    /**
     * Get total items count
     */
    public function getTotalItemsAttribute()
    {
        return collect($this->items ?? [])->sum('qty');
    }

    /**
     * Get total price
     */
    public function getTotalAttribute()
    {
        return collect($this->items ?? [])->sum('lineTotal');
    }
}
