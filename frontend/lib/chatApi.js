import { fetchWithTimeout } from './fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * Get all conversations for the authenticated user
 */
export async function getConversations(token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/chat/conversations`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch conversations');
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error in getConversations:', error);
    throw error;
  }
}

/**
 * Get messages for a specific conversation
 */
export async function getMessages(token, conversationId) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/chat/conversations/${conversationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch messages');
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error in getMessages:', error);
    throw error;
  }
}

/**
 * Send a message
 */
export async function sendMessage(token, payload) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/chat/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error in sendMessage:', error);
    throw error;
  }
}

/**
 * Mark messages in a conversation as read
 */
export async function markAsRead(token, conversationId) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/chat/conversations/${conversationId}/read`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to mark as read');
    }

    return true;
  } catch (error) {
    console.error('Error in markAsRead:', error);
    throw error;
  }
}
