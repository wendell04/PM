<?php  
  
namespace App\Models;  
  
use MongoDB\Laravel\Eloquent\Model;  
  
class StockHistory extends Model  
{  
    protected $connection = 'mongodb';  
    protected $collection = 'stock_history'; 
  
    protected $fillable = [  
        'inventoryId',  
        'supplierId',  
        'quantity',  
        'remainingQty',  
        'unitCost',  
        'totalCost',  
        'reason',  
        'createdAt',  
    ]; 
  
    protected $casts = [  
        'quantity'     => 'integer',  
        'remainingQty' => 'integer',  
        'unitCost'     => 'float',  
        'totalCost'    => 'float',  
        'createdAt'    => 'datetime',  
    ];  
  
    protected $attributes = [  
        'remainingQty' => 0,  
    ]; 
  
    public function inventory()  
    {  
        return $this->belongsTo(Inventory::class, 'inventoryId');  
    }  
  
    public function supplier()  
    {  
        return $this->belongsTo(Supplier::class, 'supplierId');  
    }  
} 
