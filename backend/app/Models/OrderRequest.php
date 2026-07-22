<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class OrderRequest extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'order_requests';

    /**
     * The quote as the CUSTOMER is allowed to see it.
     *
     * What a job costs us is our negotiating position — it must never reach the
     * customer's copy, and "we don't render it" is not protection when the whole
     * document is one DevTools tab away. Strip it at the source instead.
     */
    public function toCustomerArray(): array
    {
        $data = $this->toArray();

        unset($data['estimatedMaterialCost'], $data['costBasis'], $data['materialsCost']);

        // `lineItems` is an appended mirror of `items`, so stripping one and not the other
        // would have left the costs in the response anyway.
        foreach (['items', 'lineItems'] as $key) {
            if (!empty($data[$key]) && is_array($data[$key])) {
                $data[$key] = array_map(function ($item) {
                    unset($item['materialCost'], $item['materials']);
                    return $item;
                }, $data[$key]);
            }
        }

        return $data;
    }

    protected $fillable = [
        'customerId',
        'customerName',
        'customerEmail',
        'items',
        'productId',
        'productName',
        'productThumbnail',
        'category',
        'priceType',
        'selectedVariants',
        'quantity',
        'designUrl',
        'designNotes',
        'designType',
        'designApproved',
        'designFee',
        'suggestedPrice',
        'finalPrice',
        'downPayment',
        'materials',
        'materialsCost',
        'paymentStatus',
        'deliveryAddress',
        'shippingFee',
        'convertedOrderId',
        'eta',
        'status',
        'statusHistory',
        'adminComment',
        'mockupUrl',
        'expiresAt',
        'estimatedMaterialCost',
        'costBasis',
        'createdAt',
        'updatedAt',
    ];

    protected $casts = [
        'items'            => 'array',
        'quantity'         => 'integer',
        'suggestedPrice'   => 'float',
        'finalPrice'       => 'float',
        'downPayment'      => 'float',
        'materials'        => 'array',
        'materialsCost'    => 'float',
        'designApproved'   => 'boolean',
        'deliveryAddress'  => 'array',
        'shippingFee'      => 'float',
        'designFee'        => 'float',
        'estimatedMaterialCost' => 'float',
        'eta'              => 'datetime',
        'expiresAt'        => 'datetime',
        'createdAt'        => 'datetime',
        'updatedAt'        => 'datetime',
    ];

    protected $attributes = [
        'status'           => 'pending_review',
        'statusHistory'    => [],
        'selectedVariants' => [],
        'paymentStatus'    => 'unpaid',
        'downPayment'      => null,
        'eta'              => null,
    ];

    protected $appends = ['lineItems'];

    /**
     * Canonical line items for a quote.
     *
     * A quote may hold several products (admin builds it in the chat quotation modal), but
     * customer-raised inquiries — and every quote written before multi-item support — only
     * carry the singular product fields. Both are folded into one shape here so readers
     * never have to care which kind they got. Legacy rows have no stored unit price, so it
     * is derived by peeling the design/delivery fees back off finalPrice.
     */
    public function getLineItemsAttribute(): array
    {
        if (is_array($this->items) && count($this->items) > 0) {
            return array_values($this->items);
        }

        $qty        = max(1, (int) ($this->quantity ?? 1));
        $goodsTotal = round(
            (float) ($this->finalPrice ?? 0)
            - (float) ($this->designFee ?? 0)
            - (float) ($this->shippingFee ?? 0),
            2
        );
        if ($goodsTotal < 0) {
            $goodsTotal = 0.0;
        }

        return [[
            'productId'   => $this->productId ? (string) $this->productId : null,
            'productName' => $this->productName,
            'thumbnail'   => $this->productThumbnail,
            'category'    => $this->category,
            'qty'         => $qty,
            'unitPrice'   => $goodsTotal > 0 ? round($goodsTotal / $qty, 2) : 0.0,
            'lineTotal'   => $goodsTotal,
        ]];
    }

    // Scopes
    public function scopePending($query)
    {
        return $query->where('status', 'pending_review');
    }

    public function scopeByCustomer($query, $customerId)
    {
        return $query->where('customerId', $customerId);
    }
}
