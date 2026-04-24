<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;
use MongoDB\Laravel\Eloquent\Casts\ObjectId;

class Product extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'products';

    protected $fillable = [
        'inventoryId',
        'bomId',
        'bomGroupName',
        'isCustom',
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
        'variantStock',
        'trackInventory',
        'stock',
        'stockStatus',
        'isPublished',
        'isActive',
        'isArchived',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        'inventoryId'    => ObjectId::class,
        'bomId'          => ObjectId::class,
        'isCustom'       => 'boolean',
        'price'          => 'float',
        'flatPrice'      => 'float',
        'trackInventory' => 'boolean',
        'stock'          => 'integer',
        'isPublished'    => 'boolean',
        'isActive'       => 'boolean',
        'isArchived'     => 'boolean',
        'createdAt'      => 'datetime',
        'updatedAt'      => 'datetime',
    ];

    protected $attributes = [
        'isActive'    => true,
        'isPublished' => false,
        'isArchived'  => false,
        'isCustom'    => false,
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
