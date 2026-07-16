<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;

class ChatInspect extends Command
{
    protected $signature   = 'chat:inspect {--user= : Filter to conversations containing this user id or email} {--reset : Delete ALL conversations and messages (dev clean slate)}';
    protected $description  = 'Diagnose chat conversation fragmentation (participants + message counts) and optionally reset chat data';

    public function handle(): int
    {
        if ($this->option('reset')) {
            return $this->reset();
        }

        $filterUserId = $this->resolveUserId($this->option('user'));

        $conversations = Conversation::orderBy('last_message_at', 'desc')->get();
        if ($filterUserId) {
            $conversations = $conversations->filter(function ($c) use ($filterUserId) {
                $parts = array_map('strval', $c->participants ?? []);
                return in_array($filterUserId, $parts, true);
            });
        }

        if ($conversations->isEmpty()) {
            $this->info('No conversations found.');
            return 0;
        }

        $this->info("Conversations: {$conversations->count()}");
        $this->newLine();

        foreach ($conversations as $c) {
            $cid   = (string) $c->_id;
            $raw   = $c->participants;
            $corrupt = !is_array($raw);
            $parts = array_map('strval', is_array($raw) ? $raw : ($raw !== null ? [$raw] : []));
            $count = Message::where('conversation_id', $cid)->count();

            // Detect legacy junk participants (placeholder ids that never resolved to a real user)
            $badParts = array_filter($parts, fn ($p) => !$this->isRealUser($p));
            $names    = array_map(fn ($p) => $this->label($p), $parts);

            $flag = '';
            if ($corrupt)                          $flag = '  <<< CORRUPT: participants is not an array';
            if (in_array('support', $parts, true) && !$flag) $flag = '  <<< LEGACY "support" participant (pre-fix junk)';
            if (count($parts) < 2 && !$flag)       $flag = '  <<< INCOMPLETE: fewer than 2 participants';
            if (!empty($badParts) && !$flag)       $flag = '  <<< non-user participant';

            $this->line("[{$cid}] msgs={$count} | last=" . ($c->last_message ?? '-') . $flag);
            $this->line('    participants: ' . implode(' , ', $names));
        }

        $this->newLine();
        // Fragmentation summary: group by the sorted participant set
        $byPair = [];
        foreach ($conversations as $c) {
            $parts = $this->partsOf($c);
            sort($parts);
            $key = implode('|', $parts);
            $byPair[$key] = ($byPair[$key] ?? 0) + 1;
        }
        $frag = array_filter($byPair, fn ($n) => $n > 1);
        if (!empty($frag)) {
            $this->warn('FRAGMENTATION DETECTED — same participant set spread across multiple conversations:');
            foreach ($frag as $key => $n) {
                $this->line("  {$n} conversations for participants [{$key}]");
            }
            $this->newLine();
            $this->line('Fix: run  php artisan chat:inspect --reset  to wipe chat data for a clean test.');
        } else {
            $this->info('No fragmentation: each participant set has a single conversation.');
        }

        return 0;
    }

    private function reset(): int
    {
        $convCount = Conversation::count();
        $msgCount  = Message::count();
        $this->warn("This will permanently delete {$convCount} conversation(s) and {$msgCount} message(s).");
        if (!$this->confirm('Proceed with chat reset? (dev only — cannot be undone)')) {
            $this->info('Cancelled.');
            return 0;
        }
        Message::query()->delete();
        Conversation::query()->delete();
        $this->info("Done. Deleted {$convCount} conversation(s) and {$msgCount} message(s).");
        return 0;
    }

    // Coerce a participants field to a string array, tolerating the JSON-string corruption.
    private function partsOf($c): array
    {
        $raw = $c->participants ?? [];
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : [$raw];
        }
        return array_map('strval', is_array($raw) ? $raw : [$raw]);
    }

    private function resolveUserId(?string $val): ?string
    {
        if (!$val) return null;
        if (str_contains($val, '@')) {
            $u = User::where('email', $val)->first();
            return $u ? (string) $u->_id : $val;
        }
        return $val;
    }

    private function isRealUser(string $id): bool
    {
        if ($id === '' || $id === 'support' || $id === 'support_auto' || $id === 'admin_auto') return false;
        return User::where('_id', $id)->exists();
    }

    private function label(string $id): string
    {
        if (!$this->isRealUser($id)) return "{$id} (NOT a user)";
        $u = User::where('_id', $id)->first();
        $name = trim(($u->firstName ?? '') . ' ' . ($u->lastName ?? ''));
        $role = $u->role ?? '?';
        return "{$id} ({$name}, {$role})";
    }
}
