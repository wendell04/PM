<?php

/*
|--------------------------------------------------------------------------
| Forecast taxonomy
|--------------------------------------------------------------------------
|
| The sales collection carries product names from two eras that never agreed
| with each other:
|
|   2023-2025  imported spreadsheet history, recorded at MOTHER-ITEM level
|              ("Mugs", "Totebag", "Button Pins") - 344 rows
|   2026-      website orders, recorded at VARIANT level
|              ("Custom Mug 11oz (Ceramic White)")                - 26 rows
|
| Neither carries an inventoryId, a productId or a jobOrderId, so the only
| way to reunite the two eras on one series is by name. This map is that
| bridge, and it is deliberately data rather than code so it can be edited
| without touching the forecast page.
|
| Once sales start carrying productId / variantId (see OrderController), new
| rows resolve without the map and only the legacy block below stays needed.
|
*/

return [

    /*
    | Legacy sale productName  =>  current product name (the mother item).
    |
    | Matching is case-insensitive and ignores surrounding whitespace.
    | Row counts are from the live database as of 18 Sept 2026 and are here
    | only so the weight of each entry is obvious when editing.
    */
    'legacy_map' => [
        'Mousepad'           => 'Custom Mousepad Rectangle 22x18cm', // 47 rows
        'Pocket Mirror'      => 'Custom Pocket Mirror 2.25"',        // 41
        'Rubber Coaster'     => 'Custom Rubber Coaster',             // 40
        'Tshirt Printing'    => 'T-Shirt Printing',                  // 29
        'Totebag'            => 'Custom Canvas Totebag',             // 29
        'Stickers Laminated' => 'Custom Vinyl Sticker Laminated Scratchproof (Kisscut/Diecut)', // 29
        'Button Pins'        => 'Custom Badge 2.25"',                // 27
        'Wood Keychain'      => 'Custom Wood Keychain 2.75"',        // 23
        'Ref Magnet'         => 'Custom Ref Magnet',                 // 19
        'Mugs'               => 'Custom Mug 11oz',                   // 19
        'Magnetic Bookmark'  => 'Custom Magnetic Bookmark 2.5"',     // 18
        'Stickers Kraft'     => 'Custom Kraft Sticker Paper',        // 4
        'Totebag Medium'     => 'Custom Canvas Totebag',             // 5 - carries a variant, see below
        // Inferred from price, not from the name: the spreadsheet's three sticker
        // lines sit on a ladder that matches today's tier-1 prices exactly -
        // "Stickers Laminated" 55 = Laminated 55, "Stickers Kraft" 33-40 ~ Kraft 35,
        // and plain "Stickers" at 40 (12 of 14 rows) = Regular Sticker Paper 40.
        // The other two rows are 45, which is Photopaper. Confirm with the client;
        // move it back to 'unresolved' below if this is wrong.
        'Stickers'           => 'Custom Regular Sticker Paper Non-Waterproof', // 14 - price-inferred
    ],

    /*
    | Legacy names that already name a variant. Resolved to the mother item
    | above, then pinned to this variant instead of being split by share.
    */
    'legacy_variant' => [
        'Totebag Medium' => 'Medium',
    ],

    /*
    | Older online product names that no longer match any product record.
    | "Canvas Totebag - Plain" predates the rename to "Custom Canvas Totebag"
    | and orphans 2 sales rows without this alias.
    */
    'product_aliases' => [
        'Canvas Totebag - Plain' => 'Custom Canvas Totebag',
    ],

    /*
    | Legacy names with no single correct answer. These are reported by the
    | taxonomy endpoint as unresolved rather than being guessed at, so the
    | figure shows up in the UI instead of silently landing on one product.
    |
    | Empty at present. "Stickers" was here until its price tied it to one
    | product; see the note on it in legacy_map.
    */
    'unresolved' => [
    ],

    /*
    | Variant share is computed from online orders inside this window. Below
    | the floor, shares are suppressed entirely and only the combined
    | mother-item series is offered - a split built on two orders is noise.
    */
    'variant_share' => [
        'window_days' => 90,
        'min_orders'  => 5,
    ],

];
