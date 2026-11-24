import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { USER_REPOSITORY, USER_OTP_REPOSITORY } from '../../config/constants';
import { EmailSendService } from '../email-send/email-send.service';
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthService - Password Reset with OTP & Temporary Password', () => {
  let service: AuthService;

  const mockJwtService = {
    signAsync: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    increment: jest.fn(),
  };

  const mockUserOtpRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockEmailSendService = {
    sendPasswordResetOtpEmail: jest.fn(),
    sendTemporaryPasswordEmail: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: USER_REPOSITORY, useValue: mockUserRepository },
        { provide: USER_OTP_REPOSITORY, useValue: mockUserOtpRepository },
        { provide: EmailSendService, useValue: mockEmailSendService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestPasswordResetOtp', () => {
    it('should generate OTP, hash it, store it, and email it when user exists', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        Id: 'user-uuid-1',
        Name: 'Agent Smith',
        Email: 'agent@example.com',
      });
      // No recent OTP (cooldown satisfied)
      mockUserOtpRepository.findOne.mockResolvedValue(null);
      mockUserOtpRepository.update.mockResolvedValue([1]);
      mockUserOtpRepository.create.mockResolvedValue({ Id: 'otp-uuid-1' });
      mockEmailSendService.sendPasswordResetOtpEmail.mockResolvedValue({ messageId: 'msg-1' });

      const result = await service.requestPasswordResetOtp({
        email: 'agent@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Verification code sent');
      expect(mockUserOtpRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          User_Id: 'user-uuid-1',
          Email: 'agent@example.com',
          Type: 'PASSWORD_RESET',
          Attempts: 0,
          Is_Used: false,
        }),
      );
      expect(mockEmailSendService.sendPasswordResetOtpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'agent@example.com',
          otp: expect.stringMatching(/^\d{6}$/),
          name: 'Agent Smith',
        }),
      );
    });

    it('should return generic success message if user does not exist (anti-enumeration)', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      const result = await service.requestPasswordResetOtp({
        email: 'nonexistent@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('If an account exists');
      expect(mockUserOtpRepository.create).not.toHaveBeenCalled();
      expect(mockEmailSendService.sendPasswordResetOtpEmail).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if cooldown rate limit (<60s) is violated', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        Id: 'user-uuid-1',
        Email: 'agent@example.com',
      });
      // Recent active OTP exists
      mockUserOtpRepository.findOne.mockResolvedValue({ Id: 'recent-otp' });

      await expect(
        service.requestPasswordResetOtp({ email: 'agent@example.com' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockUserOtpRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtpAndGenerateTemporaryPassword', () => {
    it('should verify OTP, update user password, increment Token_Version, and email temporary password', async () => {
      const realOtp = '654321';
      const otpHash = await bcrypt.hash(realOtp, 10);

      mockUserRepository.findOne.mockResolvedValue({
        Id: 'user-uuid-1',
        Name: 'Agent Smith',
        Email: 'agent@example.com',
        Token_Version: 2,
      });

      const mockOtpRecord = {
        Id: 'otp-rec-1',
        Email: 'agent@example.com',
        Otp_Hash: otpHash,
        Attempts: 0,
        Expires_At: new Date(Date.now() + 5 * 60 * 1000), // 5 mins in future
        Is_Used: false,
        update: jest.fn().mockResolvedValue(true),
      };

      mockUserOtpRepository.findOne.mockResolvedValue(mockOtpRecord);
      mockUserRepository.update.mockResolvedValue([1]);
      mockEmailSendService.sendTemporaryPasswordEmail.mockResolvedValue({ messageId: 'msg-temp' });

      const result = await service.verifyOtpAndGenerateTemporaryPassword({
        email: 'agent@example.com',
        otp: realOtp,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('temporary password has been sent');
      expect(mockOtpRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({ Is_Used: true }),
      );
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          Token_Version: 3, // incremented
          Updated_By: 'system:password-reset',
        }),
        { where: { Id: 'user-uuid-1' } },
      );
      expect(mockEmailSendService.sendTemporaryPasswordEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'agent@example.com',
          temporaryPassword: expect.any(String),
          name: 'Agent Smith',
        }),
      );
    });

    it('should reject invalid length OTPs', async () => {
      await expect(
        service.verifyOtpAndGenerateTemporaryPassword({
          email: 'agent@example.com',
          otp: '12',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when no active OTP record is found', async () => {
      mockUserRepository.findOne.mockResolvedValue({ Id: 'user-uuid-1' });
      mockUserOtpRepository.findOne.mockResolvedValue(null);

      await expect(
        service.verifyOtpAndGenerateTemporaryPassword({
          email: 'agent@example.com',
          otp: '123456',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject expired OTPs and mark them as used', async () => {
      mockUserRepository.findOne.mockResolvedValue({ Id: 'user-uuid-1' });
      const mockOtpRecord = {
        Id: 'otp-expired',
        Expires_At: new Date(Date.now() - 1000), // expired
        Attempts: 0,
        update: jest.fn().mockResolvedValue(true),
      };
      mockUserOtpRepository.findOne.mockResolvedValue(mockOtpRecord);

      await expect(
        service.verifyOtpAndGenerateTemporaryPassword({
          email: 'agent@example.com',
          otp: '123456',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockOtpRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({ Is_Used: true }),
      );
    });

    it('should increment attempt counter on wrong OTP and throw with remaining attempts', async () => {
      const correctOtpHash = await bcrypt.hash('999999', 10);

      mockUserRepository.findOne.mockResolvedValue({ Id: 'user-uuid-1' });
      const mockOtpRecord = {
        Id: 'otp-wrong',
        Otp_Hash: correctOtpHash,
        Attempts: 1,
        Expires_At: new Date(Date.now() + 5 * 60 * 1000),
        update: jest.fn().mockResolvedValue(true),
      };
      mockUserOtpRepository.findOne.mockResolvedValue(mockOtpRecord);

      await expect(
        service.verifyOtpAndGenerateTemporaryPassword({
          email: 'agent@example.com',
          otp: '111111', // wrong code
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockOtpRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({ Attempts: 2 }),
      );
    });

    it('should lock out and mark OTP as used after 5 failed attempts', async () => {
      mockUserRepository.findOne.mockResolvedValue({ Id: 'user-uuid-1' });
      const mockOtpRecord = {
        Id: 'otp-locked',
        Attempts: 5, // already at max
        Expires_At: new Date(Date.now() + 5 * 60 * 1000),
        update: jest.fn().mockResolvedValue(true),
      };
      mockUserOtpRepository.findOne.mockResolvedValue(mockOtpRecord);

      await expect(
        service.verifyOtpAndGenerateTemporaryPassword({
          email: 'agent@example.com',
          otp: '123456',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockOtpRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({ Is_Used: true }),
      );
    });
  });
});
