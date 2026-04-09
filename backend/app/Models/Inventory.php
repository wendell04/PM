<?php  
namespace App\Models;  
  
use MongoDB\Laravel\Eloquent\Model;  
  
class Inventory extends Model  
{ 
    protected $connection = 'mongodb';  
    protected $collection = 'inventory';  
  
    protected $fillable = [  
        'name', 'category', 'stockQty', 'minStockLevel', 'isOnDemand',  
        'isActive', 'deletedAt', 'supplierId', 'supplierName',  
        'lastUnitCost', 'averageCost', 'createdAt', 'updatedAt',  
    ]; 
  
    protected $casts = [
        'stockQty' => 'integer', 'minStockLevel' => 'integer',
        'isOnDemand' => 'boolean', 'isActive' => 'boolean',
        'deletedAt' => 'datetime', 'lastUnitCost' => 'float',
        'averageCost' => 'float', 'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    protected $indexes = [
        ['key' => ['isActive'   => 1]],
        ['key' => ['isOnDemand' => 1]],
        ['key' => ['supplierId' => 1]],
        ['key' => ['isActive' => 1, 'supplierId' => 1]],
    ];

    protected $attributes = [
        'isActive' => true, 'deletedAt' => null,  
        'stockQty' => 0, 'minStockLevel' => 10, 'isOnDemand' => false,  
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
