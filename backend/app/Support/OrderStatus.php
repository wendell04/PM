<?php

namespace App\Support;

/**
 * Canonical order FULFILLMENT status (Phase 1 — status machine unification).
 * Stored as lowercase codes; UI renders labels. Design proofing lives in `designStatus`,
 * payment in `paymentStatus` — NOT here. normalize() maps any legacy/mixed-case value to a
 * canonical code so old and new data coexist safely during rollout.
 */
class OrderStatus
{
    const PENDING            = 'pending';
    const PROCESSING         = 'processing';
    const IN_PRODUCTION      = 'in_production';
    const FOR_QC             = 'for_qc';
    const READY_FOR_DELIVERY = 'ready_for_delivery';
    const FOR_DELIVERY       = 'for_delivery';
    const DELIVERED          = 'delivered';
    const CANCELLED          = 'cancelled';
    const RETURNED           = 'returned';

    public static function all(): array
    {
        return [
            self::PENDING, self::PROCESSING, self::IN_PRODUCTION, self::FOR_QC,
            self::READY_FOR_DELIVERY, self::FOR_DELIVERY, self::DELIVERED,
            self::CANCELLED, self::RETURNED,
        ];
    }

    public static function labels(): array
    {
        return [
            self::PENDING            => 'Pending',
            self::PROCESSING         => 'Processing',
            self::IN_PRODUCTION      => 'In Production',
            self::FOR_QC             => 'For QC',
            self::READY_FOR_DELIVERY => 'Ready for Delivery',
            self::FOR_DELIVERY       => 'Out for Delivery',
            self::DELIVERED          => 'Delivered',
            self::CANCELLED          => 'Cancelled',
            self::RETURNED           => 'Returned',
        ];
    }

    public static function label(?string $code): string
    {
        $code = self::normalize($code);
        return self::labels()[$code] ?? ucwords(str_replace('_', ' ', (string) $code));
    }

    /** Allowed forward transitions for each canonical status. */
    public static function transitions(): array
    {
        // Backward-compatible with the current admin flow: pending may go straight to in_production,
        // and for_qc may go straight to for_delivery (ready_for_delivery is an optional middle step).
        return [
            self::PENDING            => [self::PROCESSING, self::IN_PRODUCTION, self::CANCELLED],
            self::PROCESSING         => [self::IN_PRODUCTION, self::CANCELLED],
            self::IN_PRODUCTION      => [self::FOR_QC, self::CANCELLED],
            self::FOR_QC             => [self::READY_FOR_DELIVERY, self::FOR_DELIVERY, self::IN_PRODUCTION],
            self::READY_FOR_DELIVERY => [self::FOR_DELIVERY, self::CANCELLED],
            self::FOR_DELIVERY       => [self::DELIVERED, self::RETURNED],
            // A delivered order can still come back - damaged, wrong item, or refused on the
            // doorstep after signing. Leaving this empty meant the only way to record that was to
            // leave the order looking successfully delivered.
            self::DELIVERED          => [self::RETURNED],
            self::CANCELLED          => [],
            self::RETURNED           => [],
        ];
    }

    public static function canTransition(?string $from, ?string $to): bool
    {
        $from = self::normalize($from);
        $to   = self::normalize($to);
        return in_array($to, self::transitions()[$from] ?? [], true);
    }

    public static function isTerminal(?string $code): bool
    {
        return in_array(self::normalize($code), [self::DELIVERED, self::CANCELLED, self::RETURNED], true);
    }

    /**
     * Map any legacy / mixed-case value to a canonical fulfillment code.
     * Legacy custom design states (stored in orderStatus before Phase 1) collapse to their
     * fulfillment equivalent — the design detail belongs in `designStatus`.
     */
    public static function normalize(?string $v): ?string
    {
        if ($v === null || $v === '') return $v;
        $k = strtolower(trim(str_replace([' ', '-'], '_', $v)));
        $map = [
            'pending'             => self::PENDING,
            'processing'          => self::PROCESSING,
            'in_production'       => self::IN_PRODUCTION,
            'for_qc'              => self::FOR_QC,
            'ready_for_delivery'  => self::READY_FOR_DELIVERY,
            'for_delivery'        => self::FOR_DELIVERY,
            'delivered'           => self::DELIVERED,
            'cancelled'           => self::CANCELLED,
            'canceled'            => self::CANCELLED,
            'returned'            => self::RETURNED,
            // legacy custom design states once kept in orderStatus → fulfillment equivalent
            'pending_design'      => self::PENDING,
            'pending_review'      => self::PENDING,
            'proof_sent'          => self::PENDING,
            'revision_requested'  => self::PENDING,
            'design_approved'     => self::PENDING,
            'awaiting_payment'    => self::PENDING,
            'awaiting_production' => self::PROCESSING,
        ];
        return $map[$k] ?? $k;
    }
}
