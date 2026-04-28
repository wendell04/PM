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
            $isAdmin = in_array($user->role, ['admin', 'owner']);

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
                        'id'     => (string)$other->_id,
                        'name'   => $other->firstName . ' ' . $other->lastName,
                        'avatar' => $other->avatar,
                        'role'   => $other->role,
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
                            'id'     => (string)$admin->_id,
                            'name'   => 'PersonalizeMe Support',
                            'avatar' => null,
                            'role'   => 'admin'
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
                            'id'     => (string)$c->_id,
                            'name'   => $c->firstName . ' ' . $c->lastName,
                            'avatar' => $c->avatar,
                            'role'   => 'customer'
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

            // Check if user is participant or admin
            if (!in_array($user->_id, $conversation->participants) && !in_array($user->role, ['admin', 'owner'])) {
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
                'type'            => 'required|in:text,image,order_reference,quotation',
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

                $participants = [(string)$user->_id, (string)$recipientId];
                sort($participants);

                // Find existing conversation with these exact participants
                $conversation = Conversation::where('participants', 'all', $participants)
                    ->where('participants', 'size', 2)
                    ->first();

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

            $metadata = null;
            if ($request->type === 'order_reference' && $request->order_id) {
                $order = Order::find($request->order_id);
                if ($order) {
                    $metadata = [
                        'order_id' => $order->_id,
                        'order_number' => $order->orderNumber ?? substr($order->_id, -8),
                        'status' => $order->status,
                        'total' => $order->totalAmount,
                    ];
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
            }

            $lastMessageText = match($request->type) {
                'image'     => 'Sent an image',
                'quotation' => 'Sent a quotation',
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

            // Broadcast real-time event
            broadcast(new MessageSent($message))->toOthers();

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
            $request->validate(['image' => 'required|image|max:5120']);

            $cloudName    = config('services.cloudinary.cloud_name');
            $uploadPreset = config('services.cloudinary.upload_preset');

            if (!$cloudName || !$uploadPreset) {
                return $this->errorResponse('Image uploads are not configured.', 500);
            }

            $file     = $request->file('image');
            $response = Http::timeout(55)->attach(
                'file',
                fopen($file->getRealPath(), 'r'),
                $file->getClientOriginalName(),
                ['Content-Type' => $file->getMimeType()]
            )->post("https://api.cloudinary.com/v1_1/{$cloudName}/image/upload", [
                'upload_preset' => $uploadPreset,
                'folder'        => 'pmp-chat',
            ]);

            if ($response->successful()) {
                return $this->successResponse('Image uploaded.', ['url' => $response->json('secure_url')]);
            }

            return $this->errorResponse('Failed to upload image.', 500);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to upload image.');
        }
    }

    /**
     * Mark messages as read.
     */
    public function markAsRead(Request $request, $id)
    {
        try {
            $user = $request->user();
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
