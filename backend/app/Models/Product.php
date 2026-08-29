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
        'type',
        'isCustom',
        // Whether the plain, undecorated item can be bought as it is. Separate from `isCustom`
        // because the two are not opposites: a totebag can be sold blank AND printed to order, from
        // the same shelf. Treating them as one flag forced a toggle that switched the whole product
        // from one to the other.
        'allowPlainPurchase',
        'isMadeToOrder',
        'minOrderQty',
        'designFee',
        'designTemplates',
        'name',
        'description',
        'category',
        'subCategoryCode',
        'subCategoryName',
        'tags',
        'images',
        'thumbnail',
        'variantGroups',
        // Choices that change HOW an item is made, not WHAT it is made of: cut type, finish, corner
        // style. Deliberately separate from variantGroups, which are keyed to a BOM and to stock -
        // a different cut is the same sheet, so folding these together would split one stock figure
        // into combinations that do not exist.
        // Shape: [{ id, name, options: [{ id, label, priceAdd }] }]
        'optionGroups',
        'combinations',
        'priceType',
        'price',
        'cost',
        'flatPrice',
        'priceTiers',
        'variantPrices',
        'variantStock',
        'variantBackorder',
        'variantImageUrls',
        'designFormats',
        'trackInventory',
        'stock',
        'stockStatus',
        'isPublished',
        'isActive',
        'isArchived',
        'requiresDownpayment',
        'downpaymentPercent',
        'weightGrams',
        'storeStockCap',
        'createdAt',
        'updatedAt',
        'allowCOD',
        'hideWhenOutOfStock',
        'isFeatured',
    ];

    protected $casts = [
        'inventoryId'         => ObjectId::class,
        'bomId'               => ObjectId::class,
        'isCustom'            => 'boolean',
        'allowPlainPurchase'  => 'boolean',
        'isMadeToOrder'       => 'boolean',
        'minOrderQty'         => 'integer',
        'designFee'           => 'float',
        'requiresDownpayment' => 'boolean',
        'downpaymentPercent'  => 'integer',
        'weightGrams'         => 'integer',
        'storeStockCap'       => 'integer',
        'price'               => 'float',
        'cost'                => 'float',
        'flatPrice'      => 'float',
        'trackInventory' => 'boolean',
        'stock'          => 'integer',
        'isPublished'        => 'boolean',
        'isActive'           => 'boolean',
        'isArchived'         => 'boolean',
        'allowCOD'           => 'boolean',
        'hideWhenOutOfStock' => 'boolean',
        'isFeatured'         => 'boolean',
        'createdAt'          => 'datetime',
        'updatedAt'          => 'datetime',
    ];

    protected $attributes = [
        'isActive'    => true,
        'isPublished' => false,
        'isArchived'  => false,
        'isCustom'    => false,
        'allowCOD'    => true,
        'isFeatured'  => false,
        'hideWhenOutOfStock' => false,
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

    /**
     * Resolve this product's Bill of Materials for a given variant.
     *
     * A product can carry its BOM in three different shapes, and every caller that
     * checks stock or deducts inventory must agree on which one wins — when they
     * disagreed before, variants were validated and then never deducted, so stock
     * silently drifted away from reality. This is the single source of truth.
     */
    public function resolveBom($variantId = null)
    {
        $bom = null;

        if (!empty($this->bomGroupName) && $variantId) {
            $bom = BillOfMaterial::where('productGroupName', $this->bomGroupName)
                                 ->where('_id', $variantId)->first()
                ?: BillOfMaterial::find($variantId);
        } elseif (!empty($this->bomId)) {
            $bom = BillOfMaterial::find($this->bomId);
        }

        // Each variant combination may carry its own bomId.
        if (!$bom && $variantId && !empty($this->combinations)) {
            foreach ($this->combinations as $combo) {
                if ((string) ($combo['id'] ?? $combo['_id'] ?? '') === (string) $variantId && !empty($combo['bomId'])) {
                    $bom = BillOfMaterial::find($combo['bomId']);
                    break;
                }
            }
        }

        return $bom;
    }
}
