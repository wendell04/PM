<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Product extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'products';

    protected $fillable = [
        'inventoryId',
        'name',
        'description',
        'category',
        'subCategoryCode',
        'subCategoryName',
        'tags',
        'images',
        'thumbnail',
        'variantGroups',
        'combinations',
        'priceType',
        'price',
        'flatPrice',
        'priceTiers',
        'variantPrices',
        'trackInventory',
        'stock',
        'stockStatus',
        'isPublished',
        'isActive',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        'price'          => 'float',
        'flatPrice'      => 'float',
        'trackInventory' => 'boolean',
        'stock'          => 'integer',
        'isPublished'    => 'boolean',
        'isActive'       => 'boolean',
        'createdAt'      => 'datetime',
        'updatedAt'      => 'datetime',
    ];

    protected $attributes = [
        'isActive'    => true,
        'isPublished' => false,
    ];

    public function inventory()
    {
        return $this->belongsTo(Inventory::class, 'inventoryId');
    }

    public function scopeActive($query)
    {
        return $query->where('isActive', true);
    }

    public function scopePublished($query)
    {
        return $query->where('isPublished', true);
    }

    public function scopeByCategory($query, $category)
    {
        return $query->where('category', $category);
    }
}
