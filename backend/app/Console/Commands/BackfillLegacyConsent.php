<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/**
 * Mark existing accounts as having accepted the terms AT REGISTRATION.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: write a snapshot of today's wording. Those customers did tick a
 * required box - the old sign-up form would not submit without it - so consent genuinely happened.
 * But nobody recorded WHICH text was on screen, and inventing one now would be manufacturing
 * evidence. A fabricated snapshot is worse than an honest gap: in a dispute it is the thing that
 * destroys the credibility of every other record the shop keeps.
 *
 * So this records only what is actually known: that they accepted, and when they registered. Version
 * 0 means "predates versioning", and the absence of a snapshot is itself the honest statement that
 * the wording was not captured.
 */
class BackfillLegacyConsent extends Command
{
    protected $signature   = 'terms:backfill-legacy-consent
                              {--dry-run : Show what would change without writing}
                              {--seed-snapshot : ALSO write the CURRENT wording as the snapshot - test accounts only}';
    protected $description = 'Record that pre-existing accounts accepted the terms at registration, without inventing a snapshot';

    public function handle(): int
    {
        $dry  = (bool) $this->option('dry-run');
        $seed = (bool) $this->option('seed-snapshot');

        // --seed-snapshot attributes TODAY's wording to an account that registered months ago. That is
        // fine for accounts the team owns and only for those: on a real customer it would be
        // manufacturing evidence, and a fabricated snapshot is worse than an honest gap because it
        // destroys the credibility of every other record the shop keeps.
        $snapshot = null;
        $version  = 0;
        if ($seed) {
            $owner = User::where('role', 'owner')->first() ?? User::where('role', 'admin')->first();
            $rows  = $owner->registrationTerms ?? null;

            if (!is_array($rows) || !count($rows)) {
                $this->error('No registration terms are saved yet, so there is no wording to seed.');
                $this->line('Open Settings > Terms & Policies and press Save Registration Terms first.');
                return self::FAILURE;
            }

            $snapshot = array_map(fn ($t) => ['title' => $t['title'] ?? '', 'body' => $t['body'] ?? ''], $rows);
            $version  = (int) ($owner->registrationTermsVersion ?? 1);

            $this->warn('--seed-snapshot: writing the CURRENT wording (v' . $version . ', ' . count($snapshot) . ' sections) onto these accounts.');
            $this->warn('Only run this on accounts your team owns. Never on a real customer.');
        }

        $users = User::where('role', 'customer')->get();
        $done = 0; $skipped = 0;

        foreach ($users as $u) {
            if (!empty($u->acceptedTermsAt)) { $skipped++; continue; }

            // Verification status is NOT a consent question. Email verification proves the address
            // belongs to them; the terms box was ticked earlier, at the moment the form was
            // submitted - and the form would not submit without it. An account existing at all is
            // the proof that the form was submitted, so unverified accounts consented too.
            // (Skipping them was my earlier rule and it was wrong.)

            $when = $u->created_at ? $u->created_at->toIso8601String() : null;
            if (!$when) {
                $this->line("  skip (no created_at): {$u->email}");
                $skipped++;
                continue;
            }

            $this->line("  {$u->email}  accepted at registration on " . substr($when, 0, 10));

            if (!$dry) {
                if ($seed) {
                    $u->acceptedTermsVersion  = $version;
                    $u->acceptedTermsSnapshot = $snapshot;
                    $u->acceptedTermsLegacy   = false;
                } else {
                    $u->acceptedTermsVersion  = 0;      // predates versioning
                    $u->acceptedTermsSnapshot = null;   // never captured; saying so is the point
                    $u->acceptedTermsLegacy   = true;   // so the UI can say what this record is and is not
                }
                $u->acceptedTermsAt = $when;
                $u->save();
            }
            $done++;
        }

        $this->info(($dry ? '[dry run] ' : '') . "{$done} account(s) marked, {$skipped} skipped.");
        $this->line('Version 0 and no snapshot means: they agreed, but the wording of the day was not recorded.');

        return self::SUCCESS;
    }
}
