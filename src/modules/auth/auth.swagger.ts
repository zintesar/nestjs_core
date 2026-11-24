import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

/**
 * Swagger documentation decorator for POST login
 */
export function ApiLoginDoc() {
  return applyDecorators(
    ApiOperation({ summary: 'Login user and obtain access/refresh tokens' }),
    ApiResponse({ status: 200, description: 'User authenticated successfully' }),
    ApiResponse({ status: 401, description: 'Invalid user credentials' }),
  );
}

/**
 * Swagger documentation decorator for POST refresh-token
 */
export function ApiRefreshTokenDoc() {
  return applyDecorators(
    ApiOperation({ summary: 'Refresh access token using refresh token' }),
    ApiResponse({ status: 200, description: 'Tokens re-issued successfully' }),
    ApiResponse({ status: 401, description: 'Invalid or expired refresh token' }),
  );
}

/**
 * Swagger documentation decorator for POST logout
 */
export function ApiLogoutDoc() {
  return applyDecorators(
    ApiOperation({ summary: 'Logout user and invalidate sessions' }),
    ApiBearerAuth(),
    ApiResponse({ status: 200, description: 'Logged out successfully' }),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
  );
}

/**
 * Swagger documentation decorator for POST register
 */
export function ApiRegisterDoc() {
  return applyDecorators(
    ApiOperation({ summary: 'Register a new user' }),
    ApiResponse({ status: 201, description: 'User registered successfully' }),
    ApiResponse({ status: 401, description: 'User already exists' }),
  );
}

/**
 * Swagger documentation decorator for POST forgot-password (request OTP)
 */
export function ApiForgotPasswordDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Request a 6-digit OTP verification code for password reset',
      description:
        'Validates email existence, generates a 6-digit OTP code with 10-minute validity, and sends it via email. Rate-limited to one request per 60 seconds.',
    }),
    ApiResponse({
      status: 200,
      description: 'Verification code sent to email',
    }),
    ApiResponse({
      status: 400,
      description: 'Rate limit cooldown active or invalid request',
    }),
  );
}

/**
 * Swagger documentation decorator for POST verify-otp (verify & receive temporary password)
 */
export function ApiVerifyOtpResetPasswordDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Verify OTP code and receive a new temporary password via email',
      description:
        'Validates the 6-digit OTP code against brute force limits (max 5 attempts). Upon verification, generates a high-entropy temporary password, updates the user account, invalidates existing JWT sessions, and emails the temporary password to the user.',
    }),
    ApiResponse({
      status: 200,
      description: 'Temporary password generated and sent to email',
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid, expired, or maximum attempts exceeded for OTP',
    }),
  );
}


