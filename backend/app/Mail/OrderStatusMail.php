<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OrderStatusMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $firstName;
    public string $orderId;
    public string $newStatus;
    public float  $totalAmount;
    /** The stage in words. The raw code went out as "ready_for_delivery" more than once. */
    public string $statusLabel;
    public string $headline;
    /** Only set while a delivery fee is owed - the last moment to say so is before it ships. */
    public string $feeNote;
    public string $courierName;
    public string $trackingNumber;
    public string $trackingUrl;
    public string $orderUrl;
    public string $contactEmail;

    public function __construct(
        string $firstName,
        string $orderId,
        string $newStatus,
        float $totalAmount,
        string $headline = '',
        string $feeNote = '',
        string $courierName = '',
        string $trackingNumber = '',
        string $trackingUrl = '',
        string $orderUrl = '',
        string $contactEmail = 'personalizemeprints.admin@gmail.com'
    ) {
        $this->firstName      = $firstName;
        $this->orderId        = $orderId;
        $this->newStatus      = $newStatus;
        $this->totalAmount    = $totalAmount;
        $this->statusLabel    = self::label($newStatus);
        $this->headline       = $headline !== '' ? $headline : self::defaultHeadline($newStatus);
        $this->feeNote        = $feeNote;
        $this->courierName    = $courierName;
        $this->trackingNumber = $trackingNumber;
        $this->trackingUrl    = $trackingUrl;
        $this->orderUrl       = $orderUrl;
        $this->contactEmail   = $contactEmail;
    }

    public static function key(string $status): string
    {
        return strtolower(str_replace([' ', '-'], '_', trim($status)));
    }

    /** Both vocabularies live in the data - the old capitalised labels and the canonical codes. */
    public static function label(string $status): string
    {
        $labels = [
            'pending'             => 'Pending',
            'pending_design'      => 'Design Pending',
            'proof_sent'          => 'Proof Sent',
            'revision_requested'  => 'Revision Requested',
            'design_approved'     => 'Design Approved',
            'awaiting_payment'    => 'Awaiting Payment',
            'awaiting_production' => 'Awaiting Production',
            'processing'          => 'Processing',
            'in_production'       => 'In Production',
            'for_qc'              => 'In Quality Check',
            'ready_for_delivery'  => 'Ready for Delivery',
            'for_delivery'        => 'On Its Way',
            'delivered'           => 'Delivered',
            'returned'            => 'Returned',
            'cancelled'           => 'Cancelled',
        ];
        $key = self::key($status);
        return $labels[$key] ?? ucwords(str_replace('_', ' ', $key));
    }

    public static function defaultHeadline(string $status): string
    {
        $lines = [
            'processing'         => 'We have accepted your order and started work on it.',
            'in_production'      => 'Your order is now being made.',
            'for_qc'             => 'Your order is finished and being checked before it goes out.',
            'ready_for_delivery' => 'Your order passed quality check and is packed, waiting for the courier.',
            'for_delivery'       => 'Your order is on its way to you.',
            'delivered'          => 'Your order has been delivered. Thank you for choosing Personalize Me Prints.',
            'returned'           => 'Your order has been marked as returned. Please contact us for assistance.',
            'cancelled'          => 'Your order has been cancelled. Please contact us if you have questions.',
        ];
        return $lines[self::key($status)] ?? 'Your order has been updated.';
    }

    public function envelope(): Envelope
    {
        // One subject for every order and every stage meant Gmail stacked them into a single
        // thread and showed the newest collapsed under the old ones.
        return new Envelope(
            subject: $this->statusLabel . ' - ORD-' . strtoupper(substr($this->orderId, -8)) . ' - Personalize Me Prints',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.order-status',
        );
    }
}
