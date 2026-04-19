<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrderStatusUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public string $orderId;
    public string $status;
    public ?string $updatedBy;

    public function __construct(
        string $orderId,
        string $status,
        ?string $updatedBy = null
    ) {
        $this->orderId   = $orderId;
        $this->status    = $status;
        $this->updatedBy = $updatedBy;
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('order.' . $this->orderId),
            new PrivateChannel('admin.notifications'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'order.status.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'orderId'   => $this->orderId,
            'status'    => $this->status,
            'updatedBy' => $this->updatedBy,
            'timestamp' => now()->toISOString(),
        ];
    }
}
