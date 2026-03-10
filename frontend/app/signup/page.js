'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';

export default function Signup() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [showOTPInput, setShowOTPInput] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const router = useRouter();
  const { signup } = useAuth();

  const handleSendOTP = () => {
    if (!phoneNumber) {
      setError('Please enter a phone number');
      return;
    }

    // Simulate sending OTP
    console.log(`Sending OTP to ${phoneNumber}`);
    setOtpSent(true);
    setShowOTPInput(true);
    setError('');
    
    // Start countdown for resend
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleVerifyOTP = () => {
    if (!otp) {
      setError('Please enter the OTP');
      return;
    }

    // Simulate OTP verification
    console.log(`Verifying OTP: ${otp}`);
    setError('');
    // In a real app, you would verify the OTP with the backend
    // Then redirect to profile setup page
    router.push('/setup-profile');
  };

  const handleResendOTP = () => {
    if (countdown > 0) return; // Prevent resending during cooldown
    
    // Reset and send new OTP
    setOtp('');
    setOtpSent(false);
    setTimeout(() => {
      handleSendOTP();
    }, 100);
  };

  const handleGoogleSignup = () => {
    // Simulate Google signup
    console.log('Google signup initiated');
    // In a real app, this would redirect to Google OAuth
    // Then redirect to profile setup page
    router.push('/setup-profile');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-teal-700 p-8 text-white text-center">
          <h1 className="text-3xl font-bold mb-2">Sign Up</h1>
          <p className="opacity-80">Join us today</p>
        </div>

        <form onSubmit={(e) => {
            e.preventDefault();
            
            if (!phoneNumber) {
              setError('Please enter a phone number');
              return;
            }

            // If OTP hasn't been sent yet, send it first
            if (!otpSent) {
              handleSendOTP();
              return;
            }

            // If OTP has been sent but not verified yet, show error
            if (otpSent && !otp) {
              setError('Please enter the OTP sent to your phone number');
              return;
            }

            // If OTP is entered, verify it
            if (otp) {
              handleVerifyOTP();
              return;
            }
          }} className="p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label htmlFor="phoneNumber" className="block text-gray-700 text-sm font-medium mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              id="phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 bg-white rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              placeholder="+63 912 345 6789"
              required
            />
          </div>

          {showOTPInput && (
            <div className="mb-6">
              <label htmlFor="otp" className="block text-gray-700 text-sm font-medium mb-2">
                Enter OTP
              </label>
              <input
                type="text"
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 bg-white rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                placeholder="Enter 6-digit code"
                required
              />
            </div>
          )}

          <div className="mb-6 text-center">
            <p className="text-sm text-gray-700">
              By signing up, you agree to PersonalizeMe's <a href="#" className="text-green-600 hover:underline font-medium">Terms of Service</a> & <a href="#" className="text-green-600 hover:underline font-medium">Privacy Policy</a>
            </p>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-green-600 to-teal-700 text-white py-3 px-4 rounded-lg font-medium hover:from-green-700 hover:to-teal-800 transition transform hover:-translate-y-0.5 shadow-md"
          >
            {otpSent ? 'Verify OTP' : 'Continue'}
          </button>
        </form>

        {/* Google Signup Option */}
        <div className="mt-4 px-8">
          <div className="flex items-center my-4">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink mx-4 text-gray-500 text-sm">Or continue with</span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignup}
            className="w-full flex items-center justify-center px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition"
          >
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
              <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z" fill="#4285F4"/>
            </svg>
            Sign up with Google
          </button>
        </div>

        <div className="mt-6 px-8 text-center">
          <p className="text-gray-600 text-sm">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-green-600 hover:text-green-500">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}