<?php

namespace App\Models\Concerns;

/**
 * Every create, change and delete of a record a person manages goes into the audit trail by
 * itself, with who, when, from where, and each changed field's old and new value.
 *
 * The trail was written by hand, one controller at a time, so it covered what somebody remembered
 * to cover: sign-ins, staff, settings. Adding a material, editing a BOM, changing a product's price
 * or a voucher left nothing. Recording at the model means a new screen is audited the day it saves.
 *
 * A model says what it is and what to leave out:
 *   protected string $auditEntity = 'material';      // action prefix and the word in sentences
 *   protected string $auditNoun   = 'BOM';           // when the word should not be the prefix
 *   protected bool   $auditStaffOnly = true;         // skip what customers do to it (asks, reviews)
 *   public function auditDescribe($key, $old, $new)  // a list change in words; null = default
 *   protected array  $auditIgnore = ['stockQty'];    // fields the SYSTEM moves (counters, caches)
 *   protected array  $auditOnly   = [];              // or: only these fields
 *   protected array  $auditEvents = ['created', 'updated', 'deleted'];
 *
 * Only when a signed-in person did it. Jobs, webhooks and the scheduler have no user and are not
 * "someone changed this"; the records they write carry their own history.
 */
trait Auditable
{
    public static function bootAuditable(): void
    {
        static::created(fn ($m) => $m->writeAudit('created'));
        static::updated(fn ($m) => $m->writeAudit('updated'));
        static::deleted(fn ($m) => $m->writeAudit('deleted'));
    }

    protected function writeAudit(string $event): void
    {
        try {
            $events = property_exists($this, 'auditEvents') ? $this->auditEvents : ['created', 'updated', 'deleted'];
            if (!in_array($event, $events, true)) return;

            $request = function_exists('request') ? request() : null;
            $actor   = $request?->user();
            if (!$actor) return;
            // A customer asking for a quote or leaving a review is not the shop changing its records.
            if (!empty($this->auditStaffOnly) && ($actor->role ?? 'customer') === 'customer') return;

            $entity = property_exists($this, 'auditEntity') ? $this->auditEntity : strtolower(class_basename($this));
            $noun   = property_exists($this, 'auditNoun') ? $this->auditNoun : str_replace('_', ' ', $entity);
            $name   = $this->auditName();

            $changes = [];
            if ($event === 'updated') {
                $ignore = array_merge(['createdAt', 'updatedAt', 'created_at', 'updated_at'],
                    property_exists($this, 'auditIgnore') ? $this->auditIgnore : []);
                $only = property_exists($this, 'auditOnly') ? $this->auditOnly : [];
                foreach ($this->getChanges() as $key => $new) {
                    if (in_array($key, $ignore, true)) continue;
                    if ($only && !in_array($key, $only, true)) continue;
                    $old = $this->getOriginal($key);
                    if (self::auditNorm($old) === self::auditNorm($new)) continue;
                    // A model can put a list change in words (a BOM: "Ink 2 pcs -> 3 pcs").
                    $said = method_exists($this, 'auditDescribe') ? $this->auditDescribe($key, $old, $new) : null;
                    if ($said !== null) {
                        $changes[] = ['field' => self::auditLabel($key), 'key' => $key, 'said' => mb_substr($said, 0, 300)];
                        continue;
                    }
                    $changes[] = ['field' => self::auditLabel($key), 'key' => $key,
                        'from' => self::auditShow($old), 'to' => self::auditShow($new)];
                }
                if (!$changes) return;   // only system fields moved - not a person's change
            }

            $verb = ['created' => 'Created', 'updated' => 'Changed', 'deleted' => 'Deleted'][$event];
            // Most "deletes" here switch a flag rather than remove the record. Say what a person did.
            $flagWords = ['isActive' => ['Reactivated', 'Deactivated'], 'isArchived' => ['Archived', 'Restored'],
                'isVisible' => ['Showed', 'Hid'], 'is_visible' => ['Showed', 'Hid'], 'isPublished' => ['Published', 'Unpublished']];
            $recorded = $changes;
            if (count($changes) === 1 && isset($flagWords[$changes[0]['key']])) {
                $on = in_array($changes[0]['to'], ['yes', '1', 'true'], true);
                $verb = $flagWords[$changes[0]['key']][$on ? 0 : 1];
                $changes = [];
            }
            $desc = "{$verb} {$noun}" . ($name !== '' ? " {$name}" : '');
            if ($changes) {
                $bits = array_map(fn ($c) => isset($c['said']) ? "{$c['field']}: {$c['said']}"
                        : (strlen($c['from'] . $c['to']) <= 40 ? "{$c['field']} {$c['from']} -> {$c['to']}" : $c['field']),
                    array_slice($changes, 0, 3));
                $desc .= ': ' . implode(', ', $bits) . (count($changes) > 3 ? ' and ' . (count($changes) - 3) . ' more' : '');
            }

            \App\Models\ActivityLog::create([
                'action'           => "{$entity}.{$event}",
                'entityType'       => $entity,
                'entityId'         => (string) ($this->_id ?? $this->id ?? ''),
                'description'      => mb_substr($desc, 0, 500),
                'performedBy'      => (string) ($actor->_id ?? $actor->id),
                'performedByEmail' => $actor->email ?? null,
                'performedByName'  => trim(($actor->firstName ?? '') . ' ' . ($actor->lastName ?? '')),
                'performedByRole'  => $actor->role ?? null,
                'ip'               => $request->ip(),
                'device'           => substr((string) $request->userAgent(), 0, 255),
                'metadata'         => $recorded ? ['changes' => $recorded] : ['name' => $name],
                'createdAt'        => now(),
            ]);
        } catch (\Throwable $e) {
            // The audit must never fail the save it describes.
            \Illuminate\Support\Facades\Log::warning('Audit write failed', ['model' => static::class, 'error' => $e->getMessage()]);
        }
    }

    /** What a person would call this record. */
    protected function auditName(): string
    {
        foreach (['name', 'title', 'code', 'joId', 'returnId', 'productName', 'materialName', 'sku', 'abbreviation', 'customerName', 'key'] as $k) {
            $v = $this->getAttribute($k);
            if (is_string($v) && trim($v) !== '') {
                $variant = $k === 'productName' ? trim((string) $this->getAttribute('variantName')) : '';
                return mb_substr(trim($v) . ($variant !== '' ? " - {$variant}" : ''), 0, 120);
            }
        }
        return '';
    }

    /** "minStockLevel" -> "Min stock level". */
    protected static function auditLabel(string $key): string
    {
        $words = strtolower(trim(preg_replace('/(?<!^)[A-Z]/', ' $0', str_replace('_', ' ', $key))));
        return ucfirst($words);
    }

    protected static function auditNorm($v): string
    {
        // A changed date arrives as the raw Mongo value, the original as a Carbon. Same moment either way.
        if ($v instanceof \MongoDB\BSON\UTCDateTime) $v = $v->toDateTime();
        if ($v instanceof \DateTimeInterface) return $v->format('c');
        if (is_bool($v)) return $v ? '1' : '0';
        if (is_numeric($v)) return (string) (0 + $v);
        if (is_array($v) || is_object($v)) return json_encode($v);
        return trim((string) $v);
    }

    protected static function auditShow($v): string
    {
        if ($v === null || $v === '') return '(blank)';
        if ($v instanceof \MongoDB\BSON\UTCDateTime) $v = $v->toDateTime();
        if ($v instanceof \DateTimeInterface) return $v->format('M j, Y');
        if (is_bool($v)) return $v ? 'yes' : 'no';
        if (is_numeric($v)) return (string) (0 + $v);
        if (is_array($v) || is_object($v)) {
            $n = is_countable($v) ? count($v) : null;
            $s = json_encode($v);
            return mb_strlen($s) <= 80 ? $s : ($n !== null ? "{$n} entries" : 'a list');
        }
        $s = (string) $v;
        return mb_strlen($s) > 120 ? mb_substr($s, 0, 117) . '...' : $s;
    }
}
