import nodemailer from 'nodemailer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/Errors/AppError.js';
import { enviarCorreoRecuperacion } from '../src/Services/EmailService.js';

const { close, createTransport, sendMail } = vi.hoisted(() => ({
  close: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport },
}));

describe('password recovery email delivery', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'qa');
    vi.stubEnv('MAIL_HOST', 'smtp.gmail.com');
    vi.stubEnv('MAIL_PORT', '465');
    vi.stubEnv('MAIL_SECURE', 'true');
    vi.stubEnv('MAIL_USER', 'sender@gmail.com');
    vi.stubEnv('MAIL_PASS', 'abcdefghijklmnop');
    sendMail.mockReset().mockResolvedValue({});
    close.mockReset();
    createTransport.mockReset().mockReturnValue({ sendMail, close });
  });

  it('sends the OTP and portal recovery instructions through Gmail SMTP', async () => {
    const recoveryUrl = 'http://localhost:9000/password-recovery?email=user%40example.com';

    await expect(enviarCorreoRecuperacion('user@example.com', '123456', recoveryUrl)).resolves.toBeUndefined();

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: 'sender@gmail.com', pass: 'abcdefghijklmnop' },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('KindMetrics'),
        text: expect.stringContaining(recoveryUrl),
        html: expect.stringContaining(recoveryUrl),
      }),
    );
    expect(sendMail.mock.calls[0]?.[0].text).toContain('123456');
    expect(sendMail.mock.calls[0]?.[0].from).toContain('sender@gmail.com');
    expect(close).toHaveBeenCalledOnce();
  });

  it('requires configured Gmail credentials', async () => {
    vi.stubEnv('MAIL_USER', '');
    vi.stubEnv('MAIL_PASS', '');

    await expect(enviarCorreoRecuperacion('user@example.com', '123456', 'http://localhost:9000/password-recovery')).rejects.toMatchObject({
      code: 'MAIL_NOT_CONFIGURED',
      statusCode: 503,
    });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('reports Gmail authentication failures without exposing SMTP credentials', async () => {
    sendMail.mockRejectedValueOnce(Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 }));

    await expect(enviarCorreoRecuperacion('user@example.com', '123456', 'http://localhost:9000/password-recovery')).rejects.toMatchObject<AppError>({
      code: 'MAIL_AUTH_FAILED',
      statusCode: 503,
      message: expect.stringContaining('misma cuenta indicada en MAIL_USER'),
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects invalid Gmail STARTTLS settings before connecting', async () => {
    vi.stubEnv('MAIL_PORT', '587');

    await expect(enviarCorreoRecuperacion('user@example.com', '123456', 'http://localhost:9000/password-recovery')).rejects.toMatchObject({
      code: 'MAIL_CONFIGURATION_INVALID',
    });
    expect(createTransport).not.toHaveBeenCalled();
  });
});
