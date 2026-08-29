<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * Delete Cloudinary assets that no document references any more.
 *
 * Nothing in this codebase has ever deleted from Cloudinary. Replace a product photo, a banner, a
 * profile picture, a variant image, a rejected design, an admin proof - the old file stays, paid for,
 * for ever. The customer artwork everyone worries about is not even the bulk of it: CMS and catalog
 * images get replaced over and over while the shopfront is being tuned, and each replacement leaves
 * one behind.
 *
 * HOW IT DECIDES WHAT IS ORPHANED, and why it is done this way:
 *
 * Not by a list of fields. The URLs live in `images`, `thumbnail`, `variantImageUrls`, `avatar`,
 * `designUrl`, `designFilePaths`, `adminDesignUrl`, `banners`, `designTemplates`, and inside
 * free-form CMS documents whose shape nobody has to declare. A field list would be wrong the first
 * time someone adds a field, and being wrong here means deleting a file that is still on the site.
 *
 * So it serialises each document whole and pulls every Cloudinary public_id out of the JSON. A URL
 * survives if it appears ANYWHERE in ANY document, nested however deep. The failure mode of this
 * approach is keeping a file too long, which costs a fraction of a peso; the failure mode of the
 * field list is a broken product page.
 *
 * SAFETY:
 *   - Reports only, unless --force.
 *   - Never touches anything uploaded in the last --min-age days (default 7). An asset uploaded
 *     seconds ago, mid-checkout, is not yet referenced by anything and is not an orphan.
 *   - Stops at --limit deletions in one run, so a mistake is small and recoverable.
 */
class SweepOrphanedAssets extends Command
{
    protected $signature   = 'assets:sweep-orphans
                              {--force : Actually delete. Without this the command only reports}
                              {--min-age=7 : Leave anything uploaded in the last N days alone}
                              {--limit=200 : Stop after this many deletions in one run}
                              {--include-folder= : Comma-separated folders to sweep even though nothing references them}';
    protected $description = 'Delete Cloudinary files no document references any more';

    public function handle(): int
    {
        $cloud  = config('services.cloudinary.cloud_name');
        $key    = config('services.cloudinary.api_key');
        $secret = config('services.cloudinary.api_secret');

        if (!$cloud || !$key || !$secret) {
            $this->error('Cloudinary is not fully configured - cloud_name, api_key and api_secret are all required.');
            $this->line('The api_secret is only needed by this command; uploads use the unsigned preset.');
            return self::FAILURE;
        }

        $force  = (bool) $this->option('force');
        $minAge = max(0, (int) $this->option('min-age'));
        $limit  = max(1, (int) $this->option('limit'));

        // ── 1. Everything the database still points at ────────────────────────
        $this->info('Reading every document for Cloudinary references...');
        $referenced = [];
        $scanned    = 0;

        // selectCollection, not the Eloquent-style ->collection() helper: that lives on the query
        // builder, not on the Connection, and calling it here reached __call and died inside the
        // driver. The command had never actually run - a review reads code, it does not execute it.
        $mongo = DB::connection('mongodb')->getMongoDB();

        foreach ($mongo->listCollectionNames() as $name) {
            foreach ($mongo->selectCollection($name)->find() as $doc) {
                $scanned++;
                // Slashes UNescaped, or the /upload/ pattern below never matches: json_encode turns
                // every URL slash into \/ by default, so res.cloudinary.com/.../upload/ reads as
                // res.cloudinary.com\/...\/upload\/ and preg_match_all captures nothing - every
                // referenced asset would then look orphaned.
                $json = json_encode($doc, JSON_UNESCAPED_SLASHES);
                if (!$json || !str_contains($json, 'res.cloudinary.com')) continue;
                // public_id is everything after /upload/ (and any transformation or version segment),
                // minus the extension - the same id the delete endpoint takes.
                if (preg_match_all('#res\.cloudinary\.com/[^/]+/(?:image|raw|video)/upload/([^"\s?\\\\]+)#i', $json, $m)) {
                    foreach ($m[1] as $path) {
                        // BOTH forms, deliberately. Cloudinary keeps the extension in the public_id of
                        // a `raw` asset and drops it for an `image` one, and a URL alone does not say
                        // which kind it points at. Recording both means an asset can only ever look
                        // MORE referenced than it is - the error that keeps a file too long, not the
                        // one that deletes artwork the printer still needs.
                        $id = $this->publicIdFrom($path, false);
                        $referenced[$id] = true;
                        $referenced[$this->stripExt($id)] = true;
                    }
                }
            }
        }
        $this->line(sprintf('  %d document(s) scanned, %d asset(s) still referenced.', $scanned, count($referenced)));

        // ── 2. Everything Cloudinary is holding ───────────────────────────────
        $cutoff  = now()->subDays($minAge);
        $orphans = [];
        $held    = 0;
        $young   = 0;

        foreach (['image', 'raw', 'video'] as $type) {
            $cursor = null;
            do {
                $res = Http::withBasicAuth($key, $secret)
                    ->get("https://api.cloudinary.com/v1_1/{$cloud}/resources/{$type}", array_filter([
                        'max_results' => 500,
                        'next_cursor' => $cursor,
                    ]));

                if (!$res->successful()) {
                    $this->error("Cloudinary listing failed for {$type}: HTTP {$res->status()}");
                    $this->line('  ' . substr($res->body(), 0, 200));
                    return self::FAILURE;
                }

                $body   = $res->json();
                $cursor = $body['next_cursor'] ?? null;

                foreach ($body['resources'] ?? [] as $r) {
                    $held++;
                    $id = (string) ($r['public_id'] ?? '');
                    // Checked both ways for the same reason the references were recorded both ways.
                    if ($id === '' || isset($referenced[$id]) || isset($referenced[$this->stripExt($id)])) continue;

                    if (!empty($r['created_at']) && \Carbon\Carbon::parse($r['created_at'])->gt($cutoff)) {
                        $young++;
                        continue;
                    }

                    $orphans[] = [
                        'id'    => $id,
                        'type'  => $type,
                        'bytes' => (int) ($r['bytes'] ?? 0),
                        'at'    => substr((string) ($r['created_at'] ?? ''), 0, 10),
                    ];
                }
            } while ($cursor);
        }

        if (!$orphans) {
            $this->newLine();
            $this->info("Nothing to sweep. {$held} asset(s) held, all of them referenced or newer than {$minAge} day(s).");
            return self::SUCCESS;
        }

        // ── 3. Refuse to touch a folder the database has never mentioned ──────
        //
        // The portfolio is 57 images listed in frontend/public/portfolio-data.json - a static file
        // this command cannot read and would never know about. Every one of them looks orphaned from
        // here, and sweeping would have deleted the shop's entire gallery.
        //
        // Rather than hardcode that folder, derive the rule: a folder where SOME assets are
        // referenced is a folder the database owns, and an unreferenced file in it is genuinely
        // stale. A folder where NOTHING is referenced is a folder something else owns - a static
        // file, a hardcoded URL, a page not built yet - and the honest answer is to say so and stop.
        // Getting this wrong in the other direction costs a few megabytes; getting it wrong this way
        // destroys work nobody can recover.
        $folderOf = fn (string $id) => str_contains($id, '/') ? explode('/', $id)[0] : '(root)';

        $knownFolders = [];
        foreach (array_keys($referenced) as $refId) {
            $knownFolders[$folderOf($refId)] = true;
        }

        $include = array_filter(array_map('trim', explode(',', (string) $this->option('include-folder'))));
        $skipped = [];
        $kept    = [];
        foreach ($orphans as $o) {
            $f = $folderOf($o['id']);
            if (isset($knownFolders[$f]) || in_array($f, $include, true)) { $kept[] = $o; continue; }
            $skipped[$f]['n'] = ($skipped[$f]['n'] ?? 0) + 1;
            $skipped[$f]['b'] = ($skipped[$f]['b'] ?? 0) + $o['bytes'];
        }

        if ($skipped) {
            $this->newLine();
            $this->warn('  SKIPPED - no document references anything in these folders at all:');
            foreach ($skipped as $f => $agg) {
                $this->line(sprintf('    %-34s %5d file(s)  %8s', $f, $agg['n'], $this->human($agg['b'])));
            }
            $this->line('    Something outside the database is using these - a static file, a hardcoded');
            $this->line('    URL, a page not built yet. Check before you decide they are rubbish.');
            $this->line('    To sweep one anyway: --include-folder=name,other-name');
        }

        $orphans = $kept;
        if (!$orphans) {
            $this->newLine();
            $this->info('Nothing left to sweep once unowned folders are set aside.');
            return self::SUCCESS;
        }

        // ── 4. Report, grouped by folder so the shape is visible before anything goes ──
        $byFolder = [];
        foreach ($orphans as $o) {
            $folder = $folderOf($o['id']);
            $byFolder[$folder]['n'] = ($byFolder[$folder]['n'] ?? 0) + 1;
            $byFolder[$folder]['b'] = ($byFolder[$folder]['b'] ?? 0) + $o['bytes'];
        }
        arsort($byFolder);

        $this->newLine();
        $this->line('  ORPHANED, BY FOLDER');
        $totalBytes = 0;
        foreach ($byFolder as $folder => $agg) {
            $this->line(sprintf('    %-34s %5d file(s)  %8s', $folder, $agg['n'], $this->human($agg['b'])));
            $totalBytes += $agg['b'];
        }
        $this->newLine();
        $this->line(sprintf('  %d held, %d referenced, %d too new to judge, %d orphaned (%s).',
            $held, count($referenced), $young, count($orphans), $this->human($totalBytes)));

        if (!$force) {
            $this->newLine();
            $this->warn('Nothing was deleted. Re-run with --force once the folders above look right.');
            $this->line('  Read the folder names first. A folder you do not recognise is a reason to stop,');
            $this->line('  not a reason to sweep harder - it may be an asset referenced somewhere this');
            $this->line('  command cannot see, such as a hardcoded URL in the frontend.');
            return self::SUCCESS;
        }

        // ── 5. Delete ─────────────────────────────────────────────────────────
        $deleted = 0; $failed = 0;
        foreach (array_slice($orphans, 0, $limit) as $o) {
            // Admin API delete, not the Upload API's destroy. Both remove an asset, but they
            // authenticate differently: destroy expects a signed request (api_key + timestamp + a
            // computed signature), while the Admin API takes the same basic auth the listing above
            // already uses. Reaching for destroy here would have failed on credentials rather than on
            // anything to do with the asset - and only when someone finally ran it with --force.
            $res = Http::withBasicAuth($key, $secret)
                ->delete("https://api.cloudinary.com/v1_1/{$cloud}/resources/{$o['type']}/upload", [
                    'public_ids' => [$o['id']],
                ]);

            if ($res->successful()) { $deleted++; }
            else {
                $failed++;
                $this->line("  failed: {$o['id']} (HTTP {$res->status()})");
            }
        }

        $this->newLine();
        $this->info("{$deleted} deleted, {$failed} failed.");
        if (count($orphans) > $limit) {
            $this->line(sprintf('  %d orphan(s) left - run again to continue.', count($orphans) - $limit));
        }

        return self::SUCCESS;
    }

    /**
     * Reduce the part of a URL after /upload/ to the asset's public_id.
     *
     * What sits between /upload/ and the id is optional and variable: any number of transformation
     * segments, then an optional version. A single regex that tries to skip them either takes too
     * little (leaving `w_900,c_limit/...` glued to the id, so a referenced proof reads as an orphan)
     * or too much (eating a folder name). Peeling the front one segment at a time is longer to read
     * and impossible to get subtly wrong.
     *
     * Transformation segments are `w_900,c_limit`, `q_auto:eco`, `fl_layer_apply,g_center` - a short
     * lowercase prefix, an underscore, then parameters. Folder names here do not take that shape.
     */
    private function publicIdFrom(string $path, bool $stripExtension = true): string
    {
        $parts = explode('/', $path);

        while ($parts) {
            $head = $parts[0];
            $isTransform = (bool) preg_match('/^[a-z]{1,3}_[^\/]*$/i', $head);
            $isVersion   = (bool) preg_match('/^v\d+$/', $head);
            if (!$isTransform && !$isVersion) break;
            array_shift($parts);
        }

        $id = implode('/', $parts);
        return $stripExtension ? $this->stripExt($id) : $id;
    }

    private function stripExt(string $path): string
    {
        $dot = strrpos($path, '.');
        $slash = strrpos($path, '/');
        // Only strip a real extension, never a dot that is part of a folder name.
        if ($dot === false || ($slash !== false && $dot < $slash)) return $path;
        return substr($path, 0, $dot);
    }

    private function human(int $bytes): string
    {
        if ($bytes >= 1073741824) return round($bytes / 1073741824, 2) . ' GB';
        if ($bytes >= 1048576)    return round($bytes / 1048576, 1) . ' MB';
        if ($bytes >= 1024)       return round($bytes / 1024) . ' KB';
        return $bytes . ' B';
    }
}
