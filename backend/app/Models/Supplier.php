<?php 
  
namespace App\Models;  
  
use MongoDB\Laravel\Eloquent\Model;  
  
class Supplier extends Model  
{  
    protected $connection = 'mongodb';  
    protected $collection = 'suppliers'; 
  
    protected $fillable = [  
        'name',  
        'contact',  
        'address',  
        'phone',  
        'isSystem',  
        'createdAt',  
    ]; 
  
    protected $casts = [  
        'isSystem'  => 'boolean',  
        'createdAt' => 'datetime',  
    ];  
  
    protected $attributes = [  
        'isSystem' => false,  
    ]; 
  
    public function inventoryItems()  
    {  
        return $this->hasMany(Inventory::class, 'supplierId');  
    }  
  
    public function stockHistory()  
    {  
        return $this->hasMany(StockHistory::class, 'supplierId');  
    }  
} 
