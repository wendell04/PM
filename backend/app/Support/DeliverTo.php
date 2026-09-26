<?php

namespace App\Support;

use App\Models\User;

/**
 * The address a quotation's delivery fee was priced for, and whether the address the customer
 * pays with is that place.
 *
 * The shop prices a courier by hand, for one address. The quote kept only the number, so a fee
 * worked out for Quezon City could be paid with a Cebu address picked at checkout, and nobody
 * would know until the rider quoted the real fare. The quote now records the place, and the
 * payment is checked against it.
 *
 * Three kinds of place:
 *   saved - one of the customer's saved addresses. Its id is known, so a different pick is
 *           refused outright unless it is the same barangay and city (a second saved copy).
 *   form  - what they wrote on the order form, and
 *   typed - what the shop typed in, from the chat. Both are free text. The checkout matches a
 *           saved address to it by barangay and city; when the text cannot be read that way
 *           ("QC"), the customer confirms it is the same place, and the order says so.
 *
 * With no delivery fee on the quote there is nothing priced, and every address passes.
 */
class DeliverTo
{
    public const MAX_TEXT = 300;

    /**
     * What the quote stores, built on this side from the customer's own record - a saved address
     * is looked up by id rather than trusted from the browser.
     */
    public static function fromRequest(?array $in, User $customer, array $attachedForms): ?array
    {
        if (!is_array($in) || empty($in['source'])) return null;
        $source = (string) $in['source'];

        if ($source === 'saved') {
            $id = (string) ($in['addressId'] ?? '');
            foreach ((array) ($customer->addresses ?? []) as $a) {
                if ((string) ($a['id'] ?? '') !== $id) continue;
                return [
                    'source'    => 'saved',
                    'addressId' => $id,
                    'text'      => self::line($a),
                    'barangay'  => (string) ($a['barangay'] ?? ''),
                    'city'      => (string) ($a['city'] ?? ''),
                ];
            }
            return null;
        }

        if ($source === 'form') {
            // Read off the attached form, not the request: the form is what they wrote.
            foreach ($attachedForms as $f) {
                $text = trim((string) ($f['answers']['address'] ?? ''));
                if ($text !== '') return ['source' => 'form', 'text' => mb_substr($text, 0, self::MAX_TEXT)];
            }
            return null;
        }

        if ($source === 'typed') {
            $text = trim((string) ($in['text'] ?? ''));
            return $text === '' ? null : ['source' => 'typed', 'text' => mb_substr($text, 0, self::MAX_TEXT)];
        }

        return null;
    }

    /**
     * 'match'     - the same place, found by id or by barangay and city.
     * 'confirmed' - free text we could not read, and the customer says it is the same place.
     * 'differs'   - a saved address was priced and this is somewhere else.
     * 'unsure'    - free text we could not read, not confirmed yet.
     */
    public static function check(?array $priced, array $address, bool $confirmed = false): string
    {
        if (!$priced) return 'match';

        if (($priced['source'] ?? '') === 'saved') {
            if (!empty($address['id']) && (string) $address['id'] === (string) ($priced['addressId'] ?? '')) return 'match';
            return self::sameArea($priced['barangay'] ?? '', $priced['city'] ?? '', $address) ? 'match' : 'differs';
        }

        // Whole words only, and "Metro Manila" taken out first: every address in the region carries
        // it, and it would read as the City of Manila for any barangay name the two share.
        $text = ' ' . str_replace('metro manila', ' ', self::norm($priced['text'] ?? '')) . ' ';
        $brgy = self::norm($address['barangay'] ?? '');
        $city = self::city($address['city'] ?? '');
        if ($brgy !== '' && $city !== '' && str_contains($text, " $brgy ") && str_contains($text, " $city ")) return 'match';
        return $confirmed ? 'confirmed' : 'unsure';
    }

    private static function sameArea(string $barangay, string $city, array $address): bool
    {
        return self::norm($barangay) !== '' && self::norm($barangay) === self::norm($address['barangay'] ?? '')
            && self::city($city) !== '' && self::city($city) === self::city($address['city'] ?? '');
    }

    public static function line(array $a): string
    {
        return implode(', ', array_filter(array_map(fn ($k) => trim((string) ($a[$k] ?? '')),
            ['house_number', 'street', 'subdivision', 'barangay', 'city', 'province', 'zip'])));
    }

    private static function norm(string $s): string
    {
        $s = mb_strtolower($s);
        $s = preg_replace('/\b(brgy|barangay|bgy)\b\.?/u', ' ', $s);
        $s = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $s);
        return trim(preg_replace('/\s+/', ' ', $s));
    }

    // "City of Marikina", "Marikina City" and "Marikina" are one place.
    private static function city(string $s): string
    {
        $s = self::norm($s);
        $s = preg_replace('/^city of /', '', $s);
        $s = preg_replace('/ city$/', '', $s);
        return trim($s);
    }
}
