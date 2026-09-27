<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Supplier extends Model
{
    // Every create, change and delete by a signed-in person lands in the audit trail.
    use \App\Models\Concerns\Auditable;
    protected string $auditEntity = 'supplier';

    protected $connection = 'mongodb';
    protected $collection = 'suppliers';

    protected $fillable = [
        'name',
        'contactPerson',
        'phone',
        'email',
        'contacts',
        'phones',
        'emails',
        'address',
        'notes',
        'itemsSupplied',
        'isActive',
    ];

    protected $casts = [
        'isActive' => 'boolean',
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
