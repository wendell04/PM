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
    // Every create, change and delete by a signed-in person lands in the audit trail.
    use \App\Models\Concerns\Auditable;
    protected string $auditEntity = 'page_content';
    protected bool $auditStaffOnly = true;

    protected $connection = 'mongodb';
    protected $collection = 'site_content';

    protected $fillable = ['key', 'data'];
}
