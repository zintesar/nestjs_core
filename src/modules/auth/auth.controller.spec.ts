import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn(),
            login: jest.fn(),
            logout: jest.fn(),
            register: jest.fn(),
            requestPasswordResetOtp: jest.fn(),
            verifyOtpAndGenerateTemporaryPassword: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate forgotPassword to AuthService.requestPasswordResetOtp', async () => {
    const authService = controller['authService'];
    const mockRes = { success: true, message: 'OTP sent' };
    (authService.requestPasswordResetOtp as jest.Mock).mockResolvedValue(mockRes);

    const dto = { email: 'user@example.com' };
    const result = await controller.forgotPassword(dto);

    expect(result).toBe(mockRes);
    expect(authService.requestPasswordResetOtp).toHaveBeenCalledWith(dto);
  });

  it('should delegate verifyOtpAndResetPassword to AuthService.verifyOtpAndGenerateTemporaryPassword', async () => {
    const authService = controller['authService'];
    const mockRes = { success: true, message: 'Temporary password sent' };
    (authService.verifyOtpAndGenerateTemporaryPassword as jest.Mock).mockResolvedValue(mockRes);

    const dto = { email: 'user@example.com', otp: '123456' };
    const result = await controller.verifyOtpAndResetPassword(dto);

    expect(result).toBe(mockRes);
    expect(authService.verifyOtpAndGenerateTemporaryPassword).toHaveBeenCalledWith(dto);
  });
});
