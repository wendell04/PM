<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use App\Models\ActivityLog;

class PaymentController extends Controller
{
    private string $secretKey;
    private string $baseUrl = 'https://api.paymongo.com/v1';

    public function __construct()
    {
        $this->secretKey = config('services.paymongo.secret_key', '');
    }

    /**
     * POST /api/payment/create-link
     *
     * Atomic: creates Order (unpaid) + PayMongo Payment Link.
     * Returns { orderId, checkoutUrl } to frontend.
     * Frontend redirects customer to checkoutUrl.
     */
    public function createLink(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'items'                       => 'required|array|min:1',
                'items.*.productId'           => 'required|string',
                'items.*.variantId'           => 'nullable|string',
                'items.*.variantName'         => 'nullable|string',
                'items.*.qty'                 => 'required|integer|min:1',
                'notes'                       => 'nullable|string|max:1000',
                'deliveryAddress'             => 'nullable|array',
                'deliveryAddress.label'       => 'nullable|string|max:100',
                'deliveryAddress.house_number'=> 'nullable|string|max:100',
                'deliveryAddress.street'      => 'nullable|string|max:255',
                'deliveryAddress.subdivision' => 'nullable|string|max:255',
                'deliveryAddress.barangay'    => 'nullable|string|max:255',
                'deliveryAddress.city'        => 'nullable|string|max:255',
                'deliveryAddress.province'    => 'nullable|string|max:255',
                'deliveryAddress.zip'         => 'nullable|string|max:10',
                'deliveryAddress.phone'       => 'nullable|string|max:30',
                'design_file'                 => 'nullable|file|mimes:jpeg,jpg,png,pdf|max:10240',
                'design_notes'                => 'nullable|string|max:2000',
            ]);

            // ── Resolve prices + build order items ────────────────────
            $orderItems  = [];
            $totalAmount = 0;

            foreach ($validated['items'] as $item) {
                $product = Product::where('_id', $item['productId'])
                                  ->where('isActive', true)
                                  ->first();

                if (!$product) {
                    return $this->errorResponse(
                        "Product '{$item['productId']}' not found or unavailable.",
                        422
                    );
                }

                $qty       = (int) $item['qty'];
                $variantId = $item['variantId'] ?? null;
                $unitPrice = $this->resolvePrice($product, $qty, $variantId);

                if ($unitPrice === null) {
                    return $this->errorResponse(
                        "No price configured for product '{$product->name}'.",
                        422
                    );
                }

                $lineTotal    = $unitPrice * $qty;
                $totalAmount += $lineTotal;

                $orderItems[] = [
                    'productId'   => (string) $product->_id,
                    'productName' => $product->name,
                    'variantId'   => $item['variantId']   ?? null,
                    'variantName' => $item['variantName'] ?? null,
                    'qty'         => $qty,
                    'unitPrice'   => $unitPrice,
                    'lineTotal'   => $lineTotal,
                ];
            }

            // ── Handle design file upload ─────────────────────────────
            $designFilePath = null;
            if ($request->hasFile('design_file') && $request->file('design_file')->isValid()) {
                try {
                    $designFilePath = $request->file('design_file')
                        ->store('designs', 'public');
                } catch (\Exception $fileErr) {
                    Log::warning('Design file upload failed', [
                        'error'  => $fileErr->getMessage(),
                        'userId' => (string) $user->_id,
                    ]);
                    // Non-fatal — order proceeds without file
                }
            }

            // ── Create order (paymentStatus: unpaid) ──────────────────
            $order = Order::create([
                'userId'          => (string) $user->_id,
                'userSnapshot'    => [
                    'name'  => trim("{$user->firstName} {$user->lastName}"),
                    'email' => $user->email,
                    'phone' => $user->phoneNumber ?? '',
                ],
                'items'           => $orderItems,
                'totalAmount'     => $totalAmount,
                'orderStatus'     => 'Pending',
                'paymentStatus'   => 'unpaid',
                'notes'           => strip_tags($validated['notes'] ?? ''),
                'deliveryAddress' => $validated['deliveryAddress'] ?? null,
                'designNotes'     => $validated['design_notes'] ?? null,
                'designFilePath'  => $designFilePath,
                'createdAt'       => now(),
                'updatedAt'       => now(),
            ]);

            $orderId     = (string) $order->_id;
            $frontendUrl = config('app.frontend_url', 'http://localhost:3000');
            $amountCents = (int) round($totalAmount * 100);

            // ── Create PayMongo Payment Link (/v1/links) ──────────────
            $response = Http::withBasicAuth($this->secretKey, '')
                ->post("{$this->baseUrl}/links", [
                    'data' => [
                        'attributes' => [
                            'amount'      => $amountCents,
                            'currency'    => 'PHP',
                            'description' => "PersonalizeMe Prints — Order #{$orderId}",
                            'remarks'     => "Order ID: {$orderId}",
                            'redirect'    => [
                                'success' => "{$frontendUrl}/shop/payment-success?id={$orderId}",
                                'failed'  => "{$frontendUrl}/shop/payment-failed?id={$orderId}",
                            ],
                        ],
                    ],
                ]);

            if (!$response->successful()) {
                // Order exists but link failed — log, order stays unpaid
                Log::error('PayMongo createLink failed', [
                    'order_id' => $orderId,
                    'status'   => $response->status(),
                    'body'     => $response->body(),
                ]);
                return $this->errorResponse(
                    'Payment gateway error. Please try again.',
                    502
                );
            }

            $linkData    = $response->json();
            $checkoutUrl = $linkData['data']['attributes']['checkout_url'] ?? null;
            $linkId      = $linkData['data']['id'] ?? null;

            if (!$checkoutUrl) {
                Log::error('PayMongo createLink: no checkout_url', [
                    'order_id' => $orderId,
                    'body'     => $linkData,
                ]);
                return $this->errorResponse(
                    'Payment gateway returned an invalid response.',
                    502
                );
            }

            // Store PayMongo link reference on order
            $order->paymongoLinkId = $linkId;
            $order->checkoutUrl    = $checkoutUrl;
            $order->save();

            return $this->successResponse('Payment link created.', [
                'orderId'     => $orderId,
                'checkoutUrl' => $checkoutUrl,
            ]);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to create payment link.');
        }
    }

    /**
     * POST /api/payment/webhook
     *
     * PayMongo sends payment.paid event.
     * Extracts orderId from remarks, marks order as paid.
     * No auth middleware — verified by signature.
     */
    public function webhook(Request $request)
    {
        try {
            $webhookSecret = config('services.paymongo.webhook_secret', '');

            // ── Signature verification ────────────────────────────────
            if ($webhookSecret) {
                $sigHeader = $request->header('Paymongo-Signature');
                if (!$sigHeader) {
                    Log::warning('PayMongo webhook: missing signature');
                    return response()->json(['error' => 'Missing signature'], 401);
                }

                $parts = [];
                foreach (explode(',', $sigHeader) as $part) {
                    [$k, $v] = explode('=', $part, 2);
                    $parts[$k] = $v;
                }

                $timestamp     = $parts['t']  ?? '';
                $testSig       = $parts['te'] ?? '';
                $liveSig       = $parts['li'] ?? '';
                $rawBody       = $request->getContent();
                $signedPayload = "{$timestamp}.{$rawBody}";
                $computedSig   = hash_hmac('sha256', $signedPayload, $webhookSecret);
                $expectedSig   = app()->environment('production') ? $liveSig : $testSig;

                if (!hash_equals($computedSig, $expectedSig)) {
                    Log::warning('PayMongo webhook: invalid signature');
                    return response()->json(['error' => 'Invalid signature'], 401);
                }
            }

            // ── Extract event type ────────────────────────────────────
            $payload   = $request->json()->all();
            $eventType = $payload['data']['attributes']['type'] ?? null;

            if ($eventType !== 'payment.paid') {
                return response()->json(['received' => true]);
            }

            // ── Extract orderId from remarks ──────────────────────────
            $data    = $payload['data']['attributes']['data'] ?? [];
            $remarks = $data['attributes']['remarks'] ?? '';

            preg_match('/Order ID:\s*([a-f0-9]{24})/i', $remarks, $matches);
            $orderId = $matches[1] ?? null;

            if (!$orderId) {
                Log::warning('PayMongo webhook: could not extract orderId', [
                    'remarks' => $remarks,
                ]);
                return response()->json(['received' => true]);
            }

            // ── Update order paymentStatus ────────────────────────────
            $order = Order::find($orderId);
            if (!$order) {
                Log::warning('PayMongo webhook: order not found', [
                    'orderId' => $orderId,
                ]);
                return response()->json(['received' => true]);
            }

            if ($order->paymentStatus !== 'paid') {
                // Extract payment metadata from webhook payload
                $paymentAttrs  = $data['attributes'] ?? [];
                $paymentMethod = $paymentAttrs['source']['type']
                    ?? $paymentAttrs['payment_method_type']
                    ?? null;
                $paymentId     = $data['id'] ?? null;
                $referenceNum  = $paymentAttrs['reference_number']
                    ?? $paymentAttrs['external_reference_number']
                    ?? null;

                $order->paymentStatus           = 'paid';
                $order->paymentDate             = now();
                $order->paymentMethod           = $paymentMethod;
                $order->paymongoPaymentId       = $paymentId;
                $order->paymongoReferenceNumber = $referenceNum;
                $order->updatedAt               = now();
                $order->save();

                // Log activity
                try {
                    ActivityLog::create([
                        'action'           => 'payment_received',
                        'entityType'       => 'order',
                        'entityId'         => $orderId,
                        'description'      => "Payment received for order #{$orderId}" .
                            ($paymentMethod ? " via {$paymentMethod}" : ''),
                        'performedBy'      => 'system',
                        'performedByEmail' => null,
                        'metadata'         => [
                            'orderId'       => $orderId,
                            'paymentMethod' => $paymentMethod,
                            'paymentId'     => $paymentId,
                            'referenceNum'  => $referenceNum,
                            'amount'        => $order->totalAmount,
                        ],
                        'createdAt'        => now(),
                    ]);
                } catch (\Exception $logErr) {
                    Log::warning('ActivityLog write failed (webhook)', [
                        'error' => $logErr->getMessage(),
                    ]);
                }

                Log::info('PayMongo webhook: order marked paid', [
                    'orderId'       => $orderId,
                    'paymentMethod' => $paymentMethod,
                    'paymentId'     => $paymentId,
                ]);
            }

            return response()->json(['received' => true]);

        } catch (\Exception $e) {
            Log::error('PayMongo webhook error', [
                'error' => $e->getMessage(),
            ]);
            // Always 200 to prevent PayMongo retries
            return response()->json(['received' => true]);
        }
    }

    /**
     * Resolves unit price — mirrors OrderController::resolvePrice exactly.
     */
    private function resolvePrice(Product $product, int $qty, ?string $variantId): ?float
    {
        if (!empty($product->flatPrice)) {
            return (float) $product->flatPrice;
        }

        if ($variantId && !empty($product->variantPrices)) {
            $vp = $product->variantPrices[$variantId] ?? null;
            if ($vp !== null) return (float) $vp;
        }

        if (!empty($product->priceTiers) && is_array($product->priceTiers)) {
            $applicable = null;
            foreach ($product->priceTiers as $tier) {
                $min = (int) ($tier['minQty'] ?? 0);
                if ($qty >= $min) {
                    $applicable = $tier;
                }
            }
            if ($applicable) return (float) $applicable['price'];
        }

        return null;
    }
}
