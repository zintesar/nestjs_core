import { Injectable, OnModuleInit } from '@nestjs/common';
import { ProducerService } from '../../config/kafka/producer/producer.service';
import { ConsumerService } from '../../config/kafka/consumer/consumer.service';
import * as nodemailer from 'nodemailer';
import { winstonLog } from '@config/winstonLog';

export interface AgentHandoffAlertPayload {
  recipients: string[];
  customer: {
    name?: string;
    phone?: string;
  };
  activityId: string;
  customerMessage: string;
  requestedAt?: Date;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: any[];
}

@Injectable()
export class EmailSendService implements OnModuleInit {
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly _kafka: ProducerService,
    private readonly _consumer: ConsumerService,
  ) {
    this.initTransporter();
  }

  private initTransporter() {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "intesarz690@gmail.com",
        pass: "ymbeshcxgaulmwuk", // The 16-character App Password
      },
    });
  }

  /**
   * Common email dispatch function.
   * Handles recipient normalization, default sender, transport delivery,
   * and centralized logging.
   *
   * @param options - Email recipients, subject, body, and optional configs
   * @returns Nodemailer delivery info, or null if no valid recipients provided
   */
  async sendEmail(options: SendEmailOptions): Promise<any> {
    const {
      to,
      subject,
      text,
      html,
      from = process.env.ALERT_EMAIL_FROM || '"NEC Support" <intesarz690@gmail.com>',
      ...rest
    } = options;

    const rawRecipients = Array.isArray(to) ? to : [to];
    const recipients = rawRecipients
      .map((r) => r?.trim())
      .filter((r): r is string => Boolean(r && r.length > 0));

    if (recipients.length === 0) {
      winstonLog.warn(`sendEmail invoked with no valid recipients for subject: "${subject}"`);
      return null;
    }

    try {
      winstonLog.info(`Dispatching email to: ${recipients.join(', ')} | Subject: "${subject}"`);
      const info = await this.transporter.sendMail({
        from,
        to: recipients,
        subject,
        text,
        html,
        ...rest,
      });
      winstonLog.info(`Email successfully dispatched to [${recipients.join(', ')}]. Message ID: ${info?.messageId}`);
      return info;
    } catch (err: any) {
      winstonLog.error(`Failed to send email to [${recipients.join(', ')}]: ${err?.message || err}`);
      throw err;
    }
  }

  /**
   * Dispatches an alert email to human agents notifying them that a customer inquiry
   * has been flagged for human takeover.
   *
   * @param payload - Recipient list and session metadata
   * @returns Nodemailer delivery info
   */
  async sendAgentHandoffAlert(payload: AgentHandoffAlertPayload): Promise<any> {
    const {
      recipients,
      customer,
      activityId,
      customerMessage,
      requestedAt = new Date(),
    } = payload;

    const subject = `[Action Required] Customer Requested Human Support - Session #${activityId}`;

    const textContent = `
A customer has requested human support via WhatsApp.

Customer Details:
- Name: ${customer.name || 'Unknown'}
- Phone Number: ${customer.phone || 'N/A'}
- Activity / Session ID: ${activityId}
- Timestamp: ${requestedAt.toISOString()}

Inbound Message:
"${customerMessage}"

Please access the agent dashboard to take over this conversation.
    `.trim();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #d9534f; margin-top: 0;">⚠️ Human Support Takeover Requested</h2>
        <p>A customer inquiry on WhatsApp has been transferred to human support.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 15px 0;" />
        <h3 style="color: #333; margin-bottom: 8px;">Session Details</h3>
        <ul style="list-style-type: none; padding-left: 0; line-height: 1.6;">
          <li><strong>Customer Name:</strong> ${customer.name || 'Unknown'}</li>
          <li><strong>Phone Number:</strong> ${customer.phone || 'N/A'}</li>
          <li><strong>Activity ID:</strong> <code>${activityId}</code></li>
          <li><strong>Requested At:</strong> ${requestedAt.toLocaleString()}</li>
        </ul>
        <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #337ab7; margin: 15px 0; border-radius: 4px;">
          <strong>Customer Message:</strong>
          <p style="margin: 8px 0 0 0; font-style: italic;">"${customerMessage}"</p>
        </div>
        <p style="color: #666; font-size: 13px; margin-top: 20px;">
          Please log in to your agent portal to take over and reply to this customer.
        </p>
      </div>
    `.trim();

    return await this.sendEmail({
      to: recipients,
      subject,
      text: textContent,
      html: htmlContent,
    });
  }

  /**
   * Dispatches a 6-digit OTP verification email for password reset.
   */
  async sendPasswordResetOtpEmail(params: {
    to: string;
    otp: string;
    expiryMinutes?: number;
    name?: string;
  }): Promise<any> {
    const { to, otp, expiryMinutes = 10, name } = params;
    const subject = `[NEC Support] Password Reset Verification Code`;

    const greeting = name ? `Hello ${name},` : 'Hello,';
    const textContent = `
${greeting}

You have requested to reset your password. Use the following verification code to proceed:

Verification Code: ${otp}

This code is valid for ${expiryMinutes} minutes. For security reasons, do NOT share this code with anyone.

If you did not request this, please ignore this email or contact your system administrator immediately.
    `.trim();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2c3e50; margin-top: 0;">🔐 Password Reset Request</h2>
        <p>${greeting}</p>
        <p>You recently requested to reset your password for your NEC Bot account. Use the verification code below to verify your request:</p>
        <div style="background-color: #f4f6f9; padding: 20px; border-radius: 6px; text-align: center; margin: 25px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1a73e8; font-family: monospace;">${otp}</span>
        </div>
        <p style="color: #555; font-size: 14px;">
          ⏳ This verification code is valid for <strong>${expiryMinutes} minutes</strong> and can only be used once.
        </p>
        <div style="border-top: 1px solid #eee; margin-top: 25px; padding-top: 15px; font-size: 12px; color: #888;">
          <p>⚠️ If you did not request a password reset, you can safely ignore this email. Your current password remains secure.</p>
        </div>
      </div>
    `.trim();

    return await this.sendEmail({
      to,
      subject,
      text: textContent,
      html: htmlContent,
    });
  }

  /**
   * Dispatches an email containing the newly generated temporary password.
   */
  async sendTemporaryPasswordEmail(params: {
    to: string;
    temporaryPassword: string;
    name?: string;
  }): Promise<any> {
    const { to, temporaryPassword, name } = params;
    const subject = `[NEC Support] Your New Temporary Password`;

    const greeting = name ? `Hello ${name},` : 'Hello,';
    const textContent = `
${greeting}

Your password has been successfully reset. Here is your temporary login password:

Temporary Password: ${temporaryPassword}

Please log in using this temporary password and change your password immediately in your account settings.

For security reasons, your previous sessions have been terminated.
    `.trim();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #27ae60; margin-top: 0;">🔑 New Temporary Password</h2>
        <p>${greeting}</p>
        <p>Your identity has been verified and a new temporary password has been generated for your account:</p>
        <div style="background-color: #f9fbf9; border: 1px dashed #27ae60; padding: 18px; border-radius: 6px; text-align: center; margin: 25px 0;">
          <span style="font-size: 24px; font-weight: bold; color: #2c3e50; font-family: monospace;">${temporaryPassword}</span>
        </div>
        <div style="background-color: #fff8e1; border-left: 4px solid #ffb300; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
          <strong style="color: #b78103;">Important Security Notice:</strong>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #5d4037;">
            Please log in and <strong>change this password immediately</strong> under your account settings. All previous login sessions have been invalidated for security.
          </p>
        </div>
        <div style="border-top: 1px solid #eee; margin-top: 25px; padding-top: 15px; font-size: 12px; color: #888;">
          <p>NEC Bot Support Team</p>
        </div>
      </div>
    `.trim();

    return await this.sendEmail({
      to,
      subject,
      text: textContent,
      html: htmlContent,
    });
  }

  async producerExample() {
    this._kafka.produce({
      topic: process.env.KAFKA_PRODUCER_TOPIC,
      messages: [{ value: 'this is emplotyee create' }],
    });
  }

  async onModuleInit() {
    this._consumer.consume(
      process.env.KAFKA_GROUP_ID,
      { topic: process.env.KAFKA_CONSUMER_TOPIC },
      {
        eachMessage: async ({ topic, partition, message }) => {
          console.log({
            source: 'update-consumer',
            message: message.value.toString(),
            partition: partition.toString(),
            topic: topic.toString(),
          });
        },
      },
    );
  }
}

