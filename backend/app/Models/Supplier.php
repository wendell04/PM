<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Supplier extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'suppliers';

    protected $fillable = [
        'name',
        'contactPerson',
        'phone',
        'email',
        'address',
        'notes',
        'itemsSupplied',
        'isActive',
    ];

    protected $casts = [
        'isActive' => 'boolean',
        'itemsSupplied' => 'array',
    ];

    protected $attributes = [
        'isActive' => true,
    ];

    /**
     * Get all inventory items from this supplier
     */
    public function inventory()
    {
        return $this->hasMany(Inventory::class, 'supplierId');
    }

    /**
     * Get all stock history records from this supplier
     */
    public function stockHistory()
    {
        return $this->hasMany(StockHistory::class, 'supplierId');
    }

    /**
     * Scope to get only active suppliers
     */
    public function scopeActive($query)
    {
        return $query->where('isActive', true);
    }
}
