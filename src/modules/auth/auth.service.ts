import {
  Inject,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { Op } from 'sequelize';
import { UserModel, UserOtpModel, OtpType } from '@models/index';
import { USER_REPOSITORY, USER_OTP_REPOSITORY } from '@config/constants';
import { EmailSendService } from '../email-send/email-send.service';
import { ForgotPasswordDto, VerifyOtpResetPasswordDto } from '../../dto';
import { winstonLog } from '@config/winstonLog';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(USER_REPOSITORY) private readonly userRepository: typeof UserModel,
    @Inject(USER_OTP_REPOSITORY)
    private readonly userOtpRepository: typeof UserOtpModel,
    private readonly emailSendService: EmailSendService,
  ) { }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private generateJti(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Parse a duration string such as "1h", "15m", "30d" into seconds.
   */
  private parseDurationToSeconds(duration: string): number {
    const units: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid duration format: "${duration}"`);
    }
    return parseInt(match[1], 10) * units[match[2]];
  }

  // ─── Token Generation ──────────────────────────────────────────────────────

  async generateAccessToken(user: any): Promise<{ token: string; expiresAt: Date }> {
    const userId = user.id || user.Id || user.user_id;
    const jti = this.generateJti();
    const expiration = process.env.TOKEN_EXPIRATION || '15m';
    const ttlSeconds = this.parseDurationToSeconds(expiration);
    const tokenVersion = user.Token_Version ?? user.token_version ?? 1;

    const payload = {
      ...user,
      id: userId,
      user_id: userId,
      token_version: tokenVersion,
      jti,
    };

    const token = await this.jwtService.signAsync(payload, {
      secret: process.env.JWTKEY,
      expiresIn: expiration as any,
    });

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    return { token, expiresAt };
  }

  async generateRefreshToken(user: any): Promise<{ token: string; expiresAt: Date }> {
    const userId = user.id || user.Id || user.user_id;
    const jti = this.generateJti();
    const expiration = process.env.REFRESH_TOKEN_EXPIRATION || '30d';
    const ttlSeconds = this.parseDurationToSeconds(expiration);
    const tokenVersion = user.Token_Version ?? user.token_version ?? 1;

    const payload = {
      ...user,
      id: userId,
      user_id: userId,
      token_version: tokenVersion,
      jti,
    };

    const token = await this.jwtService.signAsync(payload, {
      secret: process.env.REFRESH_KEY,
      expiresIn: expiration as any,
    });

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    return { token, expiresAt };
  }

  // ─── Session Management ────────────────────────────────────────────────────

  async deleteAllUserSessions(_userId: string | number): Promise<void> {
    // Stateless auth: No persistent server-side sessions to purge
  }

  // ─── Auth Flow ─────────────────────────────────────────────────────────────

  async validateUser(username: string, password: string) {
    let user = await (this.userRepository as any).findOne({ where: { Name: username } });
    if (!user) {
      user = await (this.userRepository as any).findOne({ where: { Email: username } });
    }

    if (!user) {
      return null;
    }

    const hashedPassword = user.Password || user.password;
    if (!hashedPassword) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, hashedPassword);
    if (!isPasswordValid) {
      return null;
    }

    // Return a plain object without the password
    const plainUser = user.get({ plain: true });
    const { password: _pw, Password: _pw2, ...result } = plainUser;
    const userId = plainUser.id || plainUser.Id;
    return {
      ...result,
    };
  }

  public async login(user: any) {
    // Issue both tokens in parallel
    const [accessTokenData, refreshTokenData] = await Promise.all([
      this.generateAccessToken(user),
      this.generateRefreshToken(user),
    ]);

    return {
      user: user,
      access_token: accessTokenData.token,
      access_token_expires: accessTokenData.expiresAt,
      refresh_token: refreshTokenData.token,
      refresh_token_expires: refreshTokenData.expiresAt,
    };
  }

  public async logout(userId: string | number): Promise<void> {
    // Invalidate existing sessions by incrementing the token version in the database
    if (userId) {
      await (this.userRepository as any).increment('Token_Version', {
        where: { Id: userId },
      });
    }
  }

  // ─── Registration ──────────────────────────────────────────────────────────

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  public async register(register: any) {
    const { name, username, email, password, user_type } = register;
    const existing = await (this.userRepository as any).findOne({
      where: { Email: email },
    }, { logging: console.log });
    if (existing) {
      throw new UnauthorizedException('User already exists');
    }
    const hashedPassword = await this.hashPassword(password);

    //generate user id
    const roleType = (user_type || '').toLowerCase() === 'admin' ? 'ADMIN' : 'AGENT';
    const prefix = `NEC-${roleType}-`;

    const lastUser = await (this.userRepository as any).findOne({
      where: {
        User_Id: {
          [Op.like]: `${prefix}%`,
        },
      },
      order: [['User_Id', 'DESC']],
    });

    let nextNumber = 1;
    if (lastUser?.User_Id) {
      const match = lastUser.User_Id.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)`));
      if (match && match[1]) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }
    const generatedUserId = `${prefix}${String(nextNumber).padStart(3, '0')}`;

    const entry_data = {
      Name: username,
      Password: hashedPassword,
      Email: email,
      User_Type: user_type,
      User_Id: generatedUserId,
    };
    console.log("🚀 ~ AuthService ~ register ~ entry_data:", entry_data)

    const newUser = await this.userRepository.create(entry_data, { logging: console.log });
    console.log("🚀 ~ AuthService ~ register ~ newUser:", newUser)
    const plainUser = newUser.get({ plain: true });
    const { password: _pw, Password: _pw2, ...result } = plainUser;
    const userId = plainUser.id || plainUser.Id;
    const userData = {
      ...result,
      id: userId,
      user_id: userId,
    };

    const tokens = await this.login(userData);

    return {
      ...userData,
      token: tokens.access_token,
      ...tokens,
    };
  }

  // ─── Password Reset (OTP & Temporary Password) ───────────────────────────

  /**
   * Generates a high-entropy temporary password containing uppercase,
   * lowercase, numbers, and special symbols.
   */
  private generateSecureTemporaryPassword(length: number = 12): string {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const special = '!@#$%&*';
    const allChars = uppercase + lowercase + numbers + special;

    const password: string[] = [
      uppercase[crypto.randomInt(0, uppercase.length)],
      lowercase[crypto.randomInt(0, lowercase.length)],
      numbers[crypto.randomInt(0, numbers.length)],
      special[crypto.randomInt(0, special.length)],
    ];

    for (let i = password.length; i < length; i++) {
      password.push(allChars[crypto.randomInt(0, allChars.length)]);
    }

    // Fisher-Yates shuffle
    for (let i = password.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [password[i], password[j]] = [password[j], password[i]];
    }

    return password.join('');
  }

  /**
   * 1. Request Password Reset OTP
   * Validates user existence, enforces cooldown, hashes OTP, and dispatches email.
   */
  public async requestPasswordResetOtp(dto: ForgotPasswordDto): Promise<any> {
    const email = dto.email.trim().toLowerCase();

    // Look up user by email
    const user = await (this.userRepository as any).findOne({
      where: { Email: email },
    });

    // To prevent user enumeration attacks, return a generic success message
    if (!user) {
      winstonLog.warn(`Password reset OTP requested for unregistered email: ${email}`);
      return {
        success: true,
        message: 'If an account exists with this email, a verification code has been sent.',
      };
    }

    const now = new Date();

    // Rate-limiting check: enforce a 60-second cooldown between requests
    const recentOtp = await (this.userOtpRepository as any).findOne({
      where: {
        Email: email,
        Type: OtpType.PASSWORD_RESET,
        Is_Used: false,
        Created_At: {
          [Op.gte]: new Date(now.getTime() - 60 * 1000),
        },
      },
    });

    if (recentOtp) {
      throw new BadRequestException(
        'A verification code was recently sent. Please wait at least 60 seconds before requesting a new code.',
      );
    }

    // Invalidate any previously active unused OTPs for this email
    await (this.userOtpRepository as any).update(
      { Is_Used: true, Updated_At: now },
      {
        where: {
          Email: email,
          Type: OtpType.PASSWORD_RESET,
          Is_Used: false,
        },
      },
    );

    // Generate cryptographically secure 6-digit numeric OTP (100000 - 999999)
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes expiry

    await (this.userOtpRepository as any).create({
      User_Id: user.Id || user.id,
      Email: email,
      Otp_Hash: otpHash,
      Type: OtpType.PASSWORD_RESET,
      Attempts: 0,
      Is_Used: false,
      Expires_At: expiresAt,
      Created_At: now,
      Updated_At: now,
    });

    // Dispatch verification email
    await this.emailSendService.sendPasswordResetOtpEmail({
      to: email,
      otp,
      expiryMinutes: 10,
      name: user.Name,
    });

    return {
      success: true,
      message: 'Verification code sent to your registered email address.',
    };
  }

  /**
   * 2. Verify OTP & Issue Temporary Password
   * Validates OTP, brute force attempts, generates temporary password,
   * updates Users table, revokes prior JWT sessions, and emails temporary password.
   */
  public async verifyOtpAndGenerateTemporaryPassword(
    dto: VerifyOtpResetPasswordDto,
  ): Promise<any> {
    const email = dto.email.trim().toLowerCase();
    const inputOtp = (dto.otp || '').trim();

    if (!inputOtp || inputOtp.length !== 6) {
      throw new BadRequestException('Verification code must be a 6-digit number.');
    }

    const user = await (this.userRepository as any).findOne({
      where: { Email: email },
    });

    if (!user) {
      throw new BadRequestException('Invalid password reset request.');
    }

    const now = new Date();

    // Retrieve active OTP record
    const otpRecord = await (this.userOtpRepository as any).findOne({
      where: {
        Email: email,
        Type: OtpType.PASSWORD_RESET,
        Is_Used: false,
      },
      order: [['Created_At', 'DESC']],
    });

    if (!otpRecord) {
      throw new BadRequestException(
        'No active verification code found. Please request a new code.',
      );
    }

    // Check expiration
    if (new Date(otpRecord.Expires_At).getTime() < now.getTime()) {
      await otpRecord.update({ Is_Used: true, Updated_At: now });
      throw new BadRequestException(
        'Verification code has expired. Please request a new code.',
      );
    }

    // Brute force prevention: max 5 attempts
    if (otpRecord.Attempts >= 5) {
      await otpRecord.update({ Is_Used: true, Updated_At: now });
      throw new BadRequestException(
        'Maximum verification attempts exceeded. Please request a new code.',
      );
    }

    // Validate OTP hash
    const isOtpValid = await bcrypt.compare(inputOtp, otpRecord.Otp_Hash);
    if (!isOtpValid) {
      const updatedAttempts = otpRecord.Attempts + 1;
      await otpRecord.update({
        Attempts: updatedAttempts,
        Updated_At: now,
        Is_Used: updatedAttempts >= 5,
      });

      const remaining = Math.max(0, 5 - updatedAttempts);
      throw new BadRequestException(
        `Invalid verification code.${remaining > 0 ? ` ${remaining} attempt(s) remaining.` : ' Maximum attempts reached. Please request a new code.'}`,
      );
    }

    // Invalidate OTP immediately to prevent replay
    await otpRecord.update({
      Is_Used: true,
      Updated_At: now,
    });

    // Generate high-entropy temporary password
    const temporaryPassword = this.generateSecureTemporaryPassword(12);
    const hashedTempPassword = await bcrypt.hash(temporaryPassword, 10);

    // Update user record:
    // 1. Set new hashed temporary password
    // 2. Increment Token_Version to revoke existing JWT sessions
    // 3. Update audit metadata
    await (this.userRepository as any).update(
      {
        Password: hashedTempPassword,
        Token_Version: (user.Token_Version || 1) + 1,
        Updated_By: 'system:password-reset',
        Updated_At: now,
      },
      {
        where: { Id: user.Id || user.id },
      },
    );

    // Email the new temporary password to the user
    await this.emailSendService.sendTemporaryPasswordEmail({
      to: email,
      temporaryPassword,
      name: user.Name,
    });

    return {
      success: true,
      message:
        'Verification successful. A new temporary password has been sent to your registered email address.',
    };
  }
}
