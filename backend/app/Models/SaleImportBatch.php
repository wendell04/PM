<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

/**
 * One upload of the sales import. Every sale it created carries its id in `importBatch`, so the
 * whole file can be taken back out in one step if it was the wrong file or had wrong numbers.
 */
class SaleImportBatch extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'sale_import_batches';

    protected $fillable = [
        'fileName',
        'rows',          // sales created
        'revenue',
        'firstDate',
        'lastDate',
        'byId',
        'byName',
        'undoneAt',
        'undoneBy',
        'createdAt',
    ];

    protected $casts = [
        'createdAt' => 'datetime',
        'undoneAt'  => 'datetime',
    ];
}
