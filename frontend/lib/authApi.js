/**
 * Authentication API Utility Functions
 * Connects authentication to MongoDB backend via Laravel API
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Import timeout helper
import { fetchWithTimeout } from './fetchWithTimeout';

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC AUTH ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register a new user
 * @param {Object} userData - User registration data { name, email, password, password_confirmation }
 * @returns {Promise<Object>} Registration result with user and token
 */
export async function register(userData) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    }, 15000); // 15 second timeout for registration

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      throw new Error(errorData.message || 'Registration failed');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error registering user:', error);
    throw error;
  }
}

/**
 * Login user
 * @param {Object} credentials - Login credentials { email, password }
 * @returns {Promise<Object>} Login result with user and token
 */
export async function login(credentials) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    }, 10000); // 10 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Invalid credentials');
      }
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      throw new Error(errorData.message || 'Login failed');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
}

/**
 * Logout user
 * @param {string} token - Auth token to invalidate
 * @returns {Promise<Object>} Logout result
 */
export async function logout(token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 5000); // 5 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Logout failed');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error logging out:', error);
    throw error;
  }
}

/**
 * Verify email address
 * @param {Object} data - Verification data { token }
 * @returns {Promise<Object>} Verification result
 */
export async function verifyEmail(data) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }, 10000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Email verification failed');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error verifying email:', error);
    throw error;
  }
}

/**
 * Resend verification email
 * @param {Object} data - Resend data { email }
 * @returns {Promise<Object>} Resend result
 */
export async function resendVerificationEmail(data) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/resend-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }, 10000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to resend verification email');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error resending verification email:', error);
    throw error;
  }
}

/**
 * Forgot password - send reset link
 * @param {Object} data - Forgot password data { email }
 * @returns {Promise<Object>} Result
 */
export async function forgotPassword(data) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }, 10000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to send reset link');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error sending reset link:', error);
    throw error;
  }
}

/**
 * Verify reset token
 * @param {Object} data - Verify token data { token, email }
 * @returns {Promise<Object>} Result
 */
export async function verifyResetToken(data) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/verify-reset-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }, 10000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Invalid reset token');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error verifying reset token:', error);
    throw error;
  }
}

/**
 * Send reset code
 * @param {Object} data - Send code data { email }
 * @returns {Promise<Object>} Result
 */
export async function sendResetCode(data) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/send-reset-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }, 10000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to send reset code');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error sending reset code:', error);
    throw error;
  }
}

/**
 * Verify reset code
 * @param {Object} data - Verify code data { email, code }
 * @returns {Promise<Object>} Result
 */
export async function verifyResetCode(data) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/verify-reset-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }, 10000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Invalid reset code');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error verifying reset code:', error);
    throw error;
  }
}

/**
 * Reset password
 * @param {Object} data - Reset data { email, code, password, password_confirmation }
 * @returns {Promise<Object>} Result
 */
export async function resetPassword(data) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }, 10000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to reset password');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error resetting password:', error);
    throw error;
  }
}

/**
 * Contact form submission
 * @param {Object} data - Contact data { name, email, message }
 * @returns {Promise<Object>} Result
 */
export async function contact(data) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }, 10000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to send message');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error sending contact message:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROTECTED USER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current authenticated user
 * @param {string} token - Auth token
 * @returns {Promise<Object>} User data
 */
export async function getCurrentUser(token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/user`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthenticated');
      }
      throw new Error('Failed to fetch user');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching current user:', error);
    throw error;
  }
}

/**
 * Update user profile
 * @param {string} token - Auth token
 * @param {Object} profileData - Profile data to update
 * @returns {Promise<Object>} Updated user
 */
export async function updateProfile(token, profileData) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(profileData),
    }, 10000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Unauthenticated');
      }
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      throw new Error(errorData.message || 'Failed to update profile');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
}

/**
 * Update user password
 * @param {string} token - Auth token
 * @param {Object} passwordData - Password data { current_password, new_password, new_password_confirmation }
 * @returns {Promise<Object>} Result
 */
export async function updatePassword(token, passwordData) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/profile/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(passwordData),
    }, 10000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Unauthenticated');
      }
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      throw new Error(errorData.message || 'Failed to update password');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating password:', error);
    throw error;
  }
}
