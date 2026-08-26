<?php  
namespace App\Models;  
  
use MongoDB\Laravel\Eloquent\Model;  
  
class Inventory extends Model  
{ 
    protected $connection = 'mongodb';  
    protected $collection = 'inventory';  
  
    protected $fillable = [
        'name', 'sku', 'uom', 'category', 'stockQty', 'minStockLevel', 'leadTimeDays', 'isOnDemand',
        'isActive', 'deletedAt', 'supplierId', 'supplierName',
        'lastUnitCost', 'averageCost', 'baseCost',
        'reservedQty', 'consumedQty', 'badOrderQty',
        'batches',
        'parentId', 'hasVariants', 'variantTypes', 'variantCombo',
        'procurementType', 'allowBackorder',
        'createdAt', 'updatedAt',
    ];
  
    protected $casts = [
        'sku'      => 'string',  'uom' => 'string',
        'stockQty' => 'integer', 'minStockLevel' => 'integer', 'leadTimeDays' => 'integer',
        'isOnDemand' => 'boolean', 'isActive' => 'boolean',
        'hasVariants' => 'boolean', 'allowBackorder' => 'boolean',
        'deletedAt' => 'datetime', 'lastUnitCost' => 'float',
        'averageCost'  => 'float', 'baseCost' => 'float',
        'reservedQty'  => 'integer',
        'consumedQty'  => 'integer',
        'badOrderQty'  => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    /**
     * Bumping the cached list version from each controller that moves stock is a losing game: eleven
     * files touch stockQty or reservedQty today, and the twelfth will forget. The model is the one
     * place every write must pass through, so it is the only honest place to invalidate from.
     */
    protected static function booted(): void
    {
        $bust = fn () => \Illuminate\Support\Facades\Cache::increment('inventory_list_ver');

        static::saved($bust);
        static::deleted($bust);
    }

    protected $indexes = [
        ['key' => ['isActive'   => 1]],
        ['key' => ['isOnDemand' => 1]],
        ['key' => ['supplierId' => 1]],
        ['key' => ['isActive' => 1, 'supplierId' => 1]],
    ];

    protected $attributes = [
        'isActive' => true, 'deletedAt' => null,  
        'stockQty' => 0, 'minStockLevel' => 10, 'leadTimeDays' => 7, 'isOnDemand' => false,
        'reservedQty' => 0, 'consumedQty' => 0, 'badOrderQty' => 0,
    ];  
 
    public function supplier() { return $this->belongsTo(Supplier::class, 'supplierId'); }  
    public function stockHistory() { return $this->hasMany(StockHistory::class, 'inventoryId'); }  
    public function products() { return $this->hasMany(Product::class, 'inventoryId'); }  
 
    public function scopeActive($query) { return $query->where('isActive', true); }  
    public function scopeTrackStock($query) { return $query->where('isOnDemand', false); }  
    public function scopeLowStock($query) { return $query->whereColumn('stockQty', '<=', 'minStockLevel')->where('isOnDemand', false); }  
    public function scopeOutOfStock($query) { return $query->where('stockQty', 0)->where('isOnDemand', false); }  
    public function scopeUponOrder($query) { return $query->where('isOnDemand', true); }  
} 
