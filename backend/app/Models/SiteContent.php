<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

/**
 * Generic editable landing-page section content, keyed by section name
 * (e.g. 'pricing', 'contact', 'how_it_works', 'why_us'). `data` holds the
 * section's JSON payload. Falls back to hardcoded defaults on the frontend
 * when a key has no row yet.
 */
class SiteContent extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'site_content';

    protected $fillable = ['key', 'data'];
}
