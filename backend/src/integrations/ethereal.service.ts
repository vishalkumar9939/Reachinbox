import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env.js';

class MailService {
  private transporter: Transporter | null = null;
  private isTestAccount = false;
  private testAccountInfo: any = null;

  async initTransporter(): Promise<Transporter> {
    if (this.transporter) return this.transporter;

    // If explicit SMTP credentials are provided in env
    if (env.SMTP_USER && env.SMTP_PASSWORD) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD,
        },
      });
      console.log(`📧 Configured custom SMTP transporter (${env.SMTP_HOST}:${env.SMTP_PORT})`);
    } else {
      // Automatically generate a dynamic Ethereal test account on the fly
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.isTestAccount = true;
        this.testAccountInfo = testAccount;
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        console.log(`✉️ Created Ethereal test account: ${testAccount.user}`);
      } catch (err: any) {
        console.warn(`⚠️ Failed to create dynamic Ethereal test account: ${err.message}. Using fallback transport.`);
        this.transporter = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
        });
      }
    }

    return this.transporter;
  }

  async sendMail(params: {
    from?: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ messageId: string; previewUrl: string | null }> {
    const transporter = await this.initTransporter();

    const fromAddress = params.from || `"${env.DEFAULT_SENDER_NAME}" <${env.DEFAULT_SENDER_EMAIL}>`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text || params.html.replace(/<[^>]*>/g, ''),
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;

    if (previewUrl) {
      console.log(`📫 Email sent to ${params.to}! View preview: ${previewUrl}`);
    } else {
      console.log(`📫 Email sent to ${params.to}! MessageId: ${info.messageId}`);
    }

    return {
      messageId: info.messageId,
      previewUrl: typeof previewUrl === 'string' ? previewUrl : null,
    };
  }

  getAccountInfo() {
    return {
      isTestAccount: this.isTestAccount,
      testUser: this.testAccountInfo?.user || env.SMTP_USER,
    };
  }
}

export const mailService = new MailService();
