<?php

namespace App\Http\Controllers;

use App\Events\MessageSent;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ChatController extends Controller
{
    /**
     * List conversations for the authenticated user.
     */
    public function index(Request $request)
    {
        try {
            $user = $request->user();
            // Staff-sees-all-conversations flag (Super Admin / Owner). Data scoping, not a gate.
            $isAdmin = \App\Support\Rbac::isSuperAdmin($user) || \App\Support\Rbac::isOwner($user);

            // Get existing conversations where the user is a participant
            $conversations = Conversation::where('participants', (string)$user->_id)
                ->orderBy('last_message_at', 'desc')
                ->get();

            $existingParticipantIds = [];
            $standardized = [];

            foreach ($conversations as $c) {
                $otherId = collect($c->participants)->filter(fn($id) => (string)$id !== (string)$user->_id)->first();
                $other = User::find($otherId);
                
                if ($otherId) $existingParticipantIds[] = (string)$otherId;
                
                $standardized[] = [
                    '_id'             => (string)$c->_id,
                    'participants'    => $c->participants,
                    'last_message'    => $c->last_message ?? 'No messages yet',
                    'last_message_at' => $c->last_message_at ? $c->last_message_at->toIso8601String() : null,
                    'unread_count'    => Message::where('conversation_id', (string)$c->_id)
                                            ->where('sender_id', '!=', (string)$user->_id)
                                            ->where('is_read', false)
                                            ->count(),
                    'other_user'      => $other ? [
                        'id'          => (string)$other->_id,
                        'name'        => $other->firstName . ' ' . $other->lastName,
                        'avatar'      => $other->avatar,
                        'role'        => $other->role,
                        'last_seen_at' => $other->last_seen_at ? $other->last_seen_at->toIso8601String() : null,
                    ] : ['name' => 'Unknown User']
                ];
            }

            // Always inject Support for customers if not already in conversations
            if (!$isAdmin) {
                $admin = User::whereIn('role', ['admin', 'owner'])->first();
                if ($admin && !in_array((string)$admin->_id, $existingParticipantIds)) {
                    // Put Support at the very top
                    array_unshift($standardized, [
                        '_id'             => 'support_auto',
                        'participants'    => [(string)$user->_id, (string)$admin->_id],
                        'last_message'    => 'Chat with our support team',
                        'last_message_at' => null,
                        'unread_count'    => 0,
                        'other_user'      => [
                            'id'          => (string)$admin->_id,
                            'name'        => 'PersonalizeMe Support',
                            'avatar'      => null,
                            'role'        => 'admin',
                            'last_seen_at' => $admin->last_seen_at ? $admin->last_seen_at->toIso8601String() : null,
                        ]
                    ]);
                }
            } else {
                // Admin side: Show customers who do NOT yet have a conversation.
                // Use PHP-level filter as safety net in case MongoDB ObjectId/string
                // type mismatch causes whereNotIn to miss some IDs.
                $existingSet = array_flip($existingParticipantIds);
                $customers = User::where('role', 'customer')
                    ->whereNotIn('_id', $existingParticipantIds)
                    ->limit(50)
                    ->get()
                    ->filter(fn($c) => !isset($existingSet[(string)$c->_id]))
                    ->take(20);

                foreach ($customers as $c) {
                    $standardized[] = [
                        '_id'             => 'new_' . (string)$c->_id,
                        'participants'    => [(string)$user->_id, (string)$c->_id],
                        'last_message'    => 'New Customer',
                        'last_message_at' => null,
                        'unread_count'    => 0,
                        'other_user'      => [
                            'id'          => (string)$c->_id,
                            'name'        => $c->firstName . ' ' . $c->lastName,
                            'avatar'      => $c->avatar,
                            'role'        => 'customer',
                            'last_seen_at' => $c->last_seen_at ? $c->last_seen_at->toIso8601String() : null,
                        ]
                    ];
                }
            }

            return response()->json([
                'status' => 'success',
                'message' => 'Conversations fetched',
                'data' => $standardized
            ]);
        } catch (\Exception $e) {
            Log::error('Chat index error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
            return response()->json(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Get messages for a specific conversation.
     */
    public function show(Request $request, $id)
    {
        try {
            $user = $request->user();
            $conversation = Conversation::find($id);

            if (!$conversation) {
                return $this->notFoundResponse('Conversation');
            }

            // Check if user is participant or admin (explicit string cast to avoid ObjectId/string mismatch)
            $userId       = (string)($user->_id ?? $user->id ?? '');
            $participants = array_map('strval', $conversation->participants ?? []);
            if (!in_array($userId, $participants, true) && !in_array($user->role ?? null, ['admin', 'owner'])) {
                return $this->unauthorizedResponse();
            }

            $messages = Message::where('conversation_id', $id)
                ->orderBy('created_at', 'asc')
                ->get();

            return $this->successResponse('Messages fetched successfully', $messages);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch messages.');
        }
    }

    /**
     * Send a new message.
     */
    public function store(Request $request)
    {
        try {
            $user = $request->user();
            $request->validate([
                'conversation_id' => 'nullable|string',
                'recipient_id'    => 'nullable|string',
                'body'            => 'nullable|string|max:2000',
                'type'            => 'required|in:text,image,file,order_reference,quotation,inquiry',
                'file_url'        => 'nullable|string',
                'order_id'        => 'nullable|string',
                'metadata'        => 'nullable|array',
            ]);

            $conversationId = $request->conversation_id;

            // If no conversation_id, find or create one with the recipient
            if (!$conversationId && $request->recipient_id) {
                $recipientId = $request->recipient_id;

                if ($recipientId === 'admin_auto' || $recipientId === 'support_auto') {
                    $admin = User::whereIn('role', ['admin', 'owner'])->first();
                    if (!$admin) {
                        return response()->json(['status' => 'error', 'message' => 'No admin available'], 404);
                    }
                    $recipientId = (string)$admin->_id;
                }

                // This is a shop, not a social network: a customer talks to the shop and the shop
                // talks back. recipient_id was free-form, so one customer could open a thread with
                // another and message them unsolicited - a channel nobody asked for and nobody
                // moderates. Staff keep the run of the place; customers reach the shop only.
                $isStaff = in_array($user->role ?? null, ['admin', 'owner'], true);
                if (!$isStaff) {
                    $recipient = User::find($recipientId);
                    if (!$recipient || !in_array($recipient->role ?? null, ['admin', 'owner'], true)) {
                        return $this->errorResponse('You can only start a conversation with the shop.', 403);
                    }
                }

                $participants = [(string)$user->_id, (string)$recipientId];
                sort($participants);

                // Find existing 1-to-1 conversation using PHP-level filter
                // (avoids MongoDB $all/$size operator compatibility issues)
                $existing = Conversation::where('participants', (string)$user->_id)->get();
                $conversation = $existing->first(function ($c) use ($recipientId, $user) {
                    $parts = array_map('strval', $c->participants ?? []);
                    return count($parts) === 2
                        && in_array((string)$recipientId, $parts, true)
                        && in_array((string)$user->_id, $parts, true);
                });

                if (!$conversation) {
                    $conversation = Conversation::create([
                        'participants' => $participants,
                        'last_message_at' => now(),
                        'is_active' => true,
                    ]);
                }
                $conversationId = (string)$conversation->_id;
            }

            $conversation = Conversation::find($conversationId);
            if (!$conversation) {
                return $this->notFoundResponse('Conversation');
            }

            // show() checked this and store() did not, which meant reading someone else's thread was
            // refused while writing into it was not: any signed-in account could post a message into
            // any conversation by supplying its id. Same rule as show(), for the same reason.
            $senderId     = (string) ($user->_id ?? $user->id ?? '');
            $participants = array_map('strval', $conversation->participants ?? []);
            if (!in_array($senderId, $participants, true)
                && !in_array($user->role ?? null, ['admin', 'owner'], true)) {
                return $this->unauthorizedResponse();
            }

            $metadata = null;
            if ($request->type === 'order_reference' && $request->order_id) {
                // Keep what the sender put on the card and add the authoritative order fields on top.
                // This used to REPLACE the metadata with a different set of key names (order_id /
                // order_number), which the card does not read - so every design-order card arrived
                // blank, showing the fallback word "Order" with no products, no figures and no link.
                $client = is_array($request->metadata) ? $request->metadata : [];
                $order  = Order::find($request->order_id);
                $metadata = $client;
                if ($order) {
                    $metadata = array_merge($client, [
                        'orderId'  => (string) $order->_id,
                        'orderNo'  => $order->orderNumber ?? $order->orderNo ?? 'ORD-' . strtoupper(substr((string) $order->_id, -8)),
                        'status'   => $order->orderStatus ?? $order->status ?? null,
                        'total'    => $order->totalAmount,
                        'products' => $client['products'] ?? implode(', ', array_values(array_filter(array_map(
                            fn ($i) => $i['productName'] ?? null,
                            $order->items ?? []
                        )))),
                    ]);
                }
            } elseif ($request->type === 'quotation' && $request->metadata) {
                $m = $request->metadata;
                $metadata = [
                    'productName' => $m['productName'] ?? '',
                    'qty'         => intval($m['qty'] ?? 1),
                    'unitPrice'   => floatval($m['unitPrice'] ?? 0),
                    'designFee'   => floatval($m['designFee'] ?? 0),
                    'deliveryFee' => floatval($m['deliveryFee'] ?? 0),
                    'note'        => $m['note'] ?? '',
                    'total'       => floatval($m['total'] ?? 0),
                ];
            } elseif ($request->type === 'file' && $request->metadata) {
                // Without this branch $metadata stayed null and the card fell back to the word
                // "Attachment" - the file arrived with its name thrown away.
                $m    = $request->metadata;
                $name = (string) ($m['name'] ?? '');
                // basename() first: a name is a label here, never a path, and "../../x.pdf" should
                // not read as one anywhere it is later echoed or used to build a filename.
                $name = basename(str_replace(['\\', "\0"], ['/', ''], $name));
                // Control characters include the right-to-left override used to disguise an
                // extension - "evilexe.[U+202E]fdp.txt" renders as "eviltxt.pdf". Strip them.
                $name = preg_replace('/[\p{C}]/u', '', $name);
                $metadata = [
                    'name' => mb_substr($name, 0, 120) ?: 'Attachment',
                    'size' => isset($m['size']) ? (int) $m['size'] : null,
                ];
            } elseif ($request->type === 'inquiry' && $request->metadata) {
                $m = $request->metadata;
                $metadata = [
                    'productName' => $m['productName'] ?? '',
                    'thumbnail'   => $m['thumbnail'] ?? null,
                    'category'    => $m['category'] ?? '',
                    'productSlug' => $m['productSlug'] ?? null,
                    'productId'   => $m['productId'] ?? null,
                ];
            }

            // Dedupe: ignore a repeat inquiry from the same sender within 20s (the chat widget can
            // fire the inquiry send more than once). Match on `body` (top-level — reliable in MongoDB,
            // and identical per product) rather than a nested metadata field. Return the existing one.
            if ($request->type === 'inquiry' && !empty($request->body)) {
                $existing = Message::where('sender_id', $user->_id)
                    ->where('type', 'inquiry')
                    ->where('body', $request->body)
                    ->where('created_at', '>=', now()->subSeconds(20))
                    ->orderBy('created_at', 'desc')
                    ->first();
                if ($existing) {
                    return response()->json($existing, 200);
                }
            }

            $lastMessageText = match($request->type) {
                'image'     => 'Sent an image',
                'quotation' => 'Sent a quotation',
                'inquiry'   => 'Requested a quote',
                default     => $request->body ?? '',
            };

            $message = Message::create([
                'conversation_id' => $conversationId,
                'sender_id'       => $user->_id,
                'sender_name'     => $user->firstName . ' ' . $user->lastName,
                'body'            => $request->body ?? '',
                'type'            => $request->type,
                'file_url'        => $request->file_url,
                'metadata'        => $metadata,
                'is_read'         => false,
            ]);

            // Update conversation last message
            $conversation->update([
                'last_message'    => $lastMessageText,
                'last_message_at' => now(),
            ]);

            // Broadcast real-time event — NON-FATAL: the message is already persisted above, so a
            // broadcast failure (e.g. the Reverb/websocket server not running) must NOT fail the send.
            try {
                broadcast(new MessageSent($message))->toOthers();
            } catch (\Throwable $e) {
                Log::warning('Chat broadcast failed (message still saved): ' . $e->getMessage());
            }

            return $this->successResponse('Message sent successfully', $message);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to send message.');
        }
    }

    /**
     * POST /api/chat/upload-image
     * Upload a chat image to Cloudinary.
     */
    public function uploadImage(Request $request)
    {
        try {
            // A document is not artwork. This accepts one so a customer can ask a question about a
            // file - "will this fit?" - which until now they could only do by taking a screenshot,
            // something Messenger has always let them do. What gets printed still travels the design
            // upload, where it is checked and tied to an order.
            $request->validate([
                // No SVG. It is XML that may carry script, and it is the one "image" format a
                // browser will execute when opened directly - which the file card invites.
                // Nothing is lost: a customer sending a reference photo has never needed one.
                'image' => 'required|file|mimes:jpg,jpeg,png,webp,gif,pdf,ai,psd,doc,docx|max:10240',
            ]);

            $cloudName    = config('services.cloudinary.cloud_name');
            $uploadPreset = config('services.cloudinary.upload_preset');

            if (!$cloudName || !$uploadPreset) {
                return $this->errorResponse('Image uploads are not configured.', 500);
            }

            $file = $request->file('image');

            // Same split the design upload makes: Cloudinary treats a PDF as an image it may
            // rasterise, and the delivered file then is not the one that was sent. `raw` returns the
            // original bytes untouched, which is the only useful thing to do with a document.
            $ext          = strtolower($file->getClientOriginalExtension());
            $isImage      = in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true);
            $resourceType = $isImage ? 'image' : 'raw';

            $response = Http::timeout(55)->attach(
                'file',
                fopen($file->getRealPath(), 'r'),
                $file->getClientOriginalName(),
                ['Content-Type' => $file->getMimeType()]
            )->post("https://api.cloudinary.com/v1_1/{$cloudName}/{$resourceType}/upload", [
                'upload_preset' => $uploadPreset,
                'folder'        => 'pmp-chat',
            ]);

            if ($response->successful()) {
                return $this->successResponse('File uploaded.', [
                    'url'  => $response->json('secure_url'),
                    // Cloudinary names the stored file itself, so without this the reader would see
                    // a random string where the document's name should be.
                    'name' => $file->getClientOriginalName(),
                    'kind' => $isImage ? 'image' : 'file',
                    'size' => $file->getSize(),
                ]);
            }

            return $this->errorResponse($response->json('error.message') ?: 'Failed to upload file.', 502);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to upload image.');
        }
    }

    /**
     * Heartbeat — keeps last_seen_at fresh while the user has chat open.
     */
    public function heartbeat(Request $request)
    {
        try {
            $request->user()->update(['last_seen_at' => now()]);
            return $this->successResponse('OK');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Heartbeat failed.');
        }
    }

    /**
     * Mark messages as read.
     */
    public function markAsRead(Request $request, $id)
    {
        try {
            $user = $request->user();
            // Same participant rule as show() and store(). Without it anyone could clear the unread
            // state on a conversation they are not in - not a leak, but it lets a stranger hide the
            // fact that a message is waiting, which is the one thing the badge exists to say.
            $conversation = Conversation::find($id);
            if (!$conversation) {
                return $this->notFoundResponse('Conversation');
            }
            $readerId     = (string) ($user->_id ?? $user->id ?? '');
            $participants = array_map('strval', $conversation->participants ?? []);
            if (!in_array($readerId, $participants, true)
                && !in_array($user->role ?? null, ['admin', 'owner'], true)) {
                return $this->unauthorizedResponse();
            }

            Message::where('conversation_id', $id)
                ->where('sender_id', '!=', $user->_id)
                ->where('is_read', false)
                ->update([
                    'is_read' => true,
                    'read_at' => now()
                ]);

            return $this->successResponse('Messages marked as read');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to mark messages as read.');
        }
    }
}
