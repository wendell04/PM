/**
 * Notification API Utility Functions
 * Connects notification system to MongoDB backend via Laravel API
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL
    || 'http://127.0.0.1:8000';

import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * Fetch all notifications for authenticated user
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} { notifications, unread_count }
 */
export async function fetchNotifications(token) {
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/api/notifications`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true',
        },
      },
      10000
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch notifications: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching notifications:', error);
    throw error;
  }
}

/**
 * Fetch unread notification count only (for polling)
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} { unread_count }
 */
export async function fetchUnreadCount(token) {
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/api/notifications/unread-count`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true',
        },
      },
      10000
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch unread count: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching unread count:', error);
    throw error;
  }
}

/**
 * Mark a single notification as read
 * @param {string} id - Notification MongoDB _id
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} { unread_count }
 */
export async function markNotificationRead(id, token) {
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/api/notifications/${id}/read`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true',
        },
      },
      10000
    );
    if (!response.ok) {
      throw new Error(`Failed to mark notification read: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error marking notification read:', error);
    throw error;
  }
}

/**
 * Mark all notifications as read
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} { unread_count }
 */
export async function markAllNotificationsRead(token) {
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/api/notifications/read-all`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true',
        },
      },
      10000
    );
    if (!response.ok) {
      throw new Error(`Failed to mark all read: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    throw error;
  }
}
