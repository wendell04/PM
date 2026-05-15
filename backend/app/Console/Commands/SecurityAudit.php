<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Runs composer audit (backend) and npm audit (frontend) and reports
 * any known vulnerabilities. Exits non-zero if HIGH/CRITICAL issues found.
 *
 * Usage: php artisan security:audit [--json]
 */
class SecurityAudit extends Command
{
    protected $signature   = 'security:audit {--json : Output raw JSON from each tool}';
    protected $description = 'Check backend and frontend dependencies for known vulnerabilities';

    public function handle(): int
    {
        $this->info('=== Dependency Vulnerability Scan ===');
        $hasHighSeverity = false;

        // --- Backend: composer audit ---
        $this->newLine();
        $this->line('<fg=cyan>Backend (composer audit)</>');
        $backendResult = $this->runAudit('composer audit --format=json 2>&1', base_path());
        if ($backendResult['exitCode'] !== 0) {
            $hasHighSeverity = true;
            $this->reportFindings('Backend', $backendResult['output'], 'composer');
        } else {
            $this->line('  <fg=green>✓ No backend vulnerabilities found</>');
        }

        // --- Frontend: npm audit ---
        $this->newLine();
        $this->line('<fg=cyan>Frontend (npm audit)</>');
        $frontendDir    = dirname(base_path()) . '/frontend';
        $frontendResult = $this->runAudit('npm audit --json 2>&1', $frontendDir);
        if ($frontendResult['exitCode'] !== 0) {
            $hasHighSeverity = true;
            $this->reportFindings('Frontend', $frontendResult['output'], 'npm');
        } else {
            $this->line('  <fg=green>✓ No frontend vulnerabilities found</>');
        }

        $this->newLine();

        if ($hasHighSeverity) {
            Log::warning('security.audit: vulnerabilities detected — review output above');
            $this->error('Vulnerabilities found. Run `composer audit` or `npm audit fix` to resolve.');
            return self::FAILURE;
        }

        Log::info('security.audit: clean — no vulnerabilities');
        $this->info('All clear — no known vulnerabilities detected.');
        return self::SUCCESS;
    }

    private function runAudit(string $cmd, string $cwd): array
    {
        $output   = [];
        $exitCode = 0;

        exec("cd " . escapeshellarg($cwd) . " && {$cmd}", $output, $exitCode);

        return ['exitCode' => $exitCode, 'output' => implode("\n", $output)];
    }

    private function reportFindings(string $label, string $raw, string $format): void
    {
        if ($this->option('json')) {
            $this->line($raw);
            return;
        }

        $decoded = json_decode($raw, true);

        if ($format === 'npm' && isset($decoded['vulnerabilities'])) {
            foreach ($decoded['vulnerabilities'] as $pkg => $info) {
                $severity = strtoupper($info['severity'] ?? 'unknown');
                $color    = match ($severity) {
                    'CRITICAL', 'HIGH' => 'red',
                    'MODERATE'         => 'yellow',
                    default            => 'white',
                };
                $this->line("  <fg={$color}>[{$severity}]</> {$pkg}: {$info['title']}");
            }
        } elseif ($format === 'composer' && isset($decoded['advisories'])) {
            foreach ($decoded['advisories'] as $pkg => $advisories) {
                foreach ($advisories as $advisory) {
                    $this->line("  <fg=red>[ADVISORY]</> {$pkg}: {$advisory['title']} ({$advisory['cve'] ?? 'no CVE'})");
                }
            }
        } else {
            $this->line("  {$label} audit output:\n{$raw}");
        }
    }
}
