<?php  
namespace App\Models;  
  
use MongoDB\Laravel\Eloquent\Model;  
  
class Inventory extends Model  
{ 
    // Every create, change and delete by a signed-in person lands in the audit trail. Stock moves
    // are left out here: they are audited as stock adjustments, with the reason.
    use \App\Models\Concerns\Auditable;
    protected string $auditEntity = 'material';
    protected array $auditIgnore = ['stockQty', 'reservedQty', 'consumedQty', 'badOrderQty', 'batches', 'averageCost', 'lastUnitCost', 'baseCost', 'forecast', 'lowStockAlertedAt'];

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
        'forecast',   // the stored restock plan, written nightly by inventory:forecast
        'lowStockAlertedAt', // when the below-minimum bell last went out; cleared on restock
    ];
  
    protected $casts = [
        'forecast' => 'array',
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
    /** Materials whose below-minimum bell is due once their save lands. Not a field: in memory only. */
    private static array $lowStockPending = [];

    protected static function booted(): void
    {
        $bust = fn () => \Illuminate\Support\Facades\Cache::increment('inventory_list_ver');

        static::saved($bust);
        static::deleted($bust);

        // A bell when a material drops BELOW its minimum - once per drop, not on every save while it
        // stays low, and armed again once it is restocked to the minimum. Done here because stock
        // leaves through a dozen paths (stock out, QC, counter sales, cancellations); the model is
        // the one place all of them pass. Only a minimum the owner set counts: no minimum, no alert,
        // and a new material created at zero is not an event.
        static::saving(function (Inventory $m) {
            $min = (int) ($m->minStockLevel ?? 0);
            if ($min <= 0 || $m->isActive === false) return;
            $now = (float) ($m->stockQty ?? 0);
            if ($now >= $min) {
                if ($m->lowStockAlertedAt) $m->lowStockAlertedAt = null;   // restocked: arm it again
                return;
            }
            if (!$m->exists || $m->lowStockAlertedAt) return;
            $before = (float) ($m->getOriginal('stockQty') ?? 0);
            if ($before < $min) return;                                 // was already low
            $m->lowStockAlertedAt = now();
            self::$lowStockPending[spl_object_id($m)] = true;            // sent after the save lands
        });
        static::saved(function (Inventory $m) {
            $key = spl_object_id($m);
            if (empty(self::$lowStockPending[$key])) return;
            unset(self::$lowStockPending[$key]);
            try { \App\Support\LowStockAlert::send($m); }
            catch (\Throwable $e) { \Illuminate\Support\Facades\Log::warning('Low stock alert failed', ['error' => $e->getMessage()]); }
        });
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
    // Below the minimum, not at it - the same line To Buy draws.
    public function scopeLowStock($query) { return $query->whereColumn('stockQty', '<', 'minStockLevel')->where('isOnDemand', false); }  
    public function scopeOutOfStock($query) { return $query->where('stockQty', 0)->where('isOnDemand', false); }  
    public function scopeUponOrder($query) { return $query->where('isOnDemand', true); }  
} 
