import nodemailer from 'nodemailer';
import { AppError } from '../Errors/AppError.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

export async function enviarCorreoRecuperacion(
  correoDestino: string,
  token: string,
  recoveryUrl: string,
): Promise<void> {
  const user = process.env.MAIL_USER?.trim();
  const password = process.env.MAIL_PASS?.replace(/\s/g, '');

  if (!user || !password) {
    throw new AppError('Configura MAIL_USER y MAIL_PASS para habilitar el envío de correo.', {
      statusCode: 503,
      code: 'MAIL_NOT_CONFIGURED',
    });
  }

  const host = process.env.MAIL_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(process.env.MAIL_PORT ?? 465);
  const secureValue = (process.env.MAIL_SECURE ?? 'true').toLowerCase();
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !['true', 'false'].includes(secureValue)) {
    throw new AppError('La configuración SMTP no es válida.', {
      statusCode: 500,
      code: 'MAIL_CONFIGURATION_INVALID',
    });
  }
  if (host === 'smtp.gmail.com' && ((port === 465) !== (secureValue === 'true'))) {
    throw new AppError('Para Gmail usa el puerto 465 con MAIL_SECURE=true o el puerto 587 con MAIL_SECURE=false.', {
      statusCode: 500,
      code: 'MAIL_CONFIGURATION_INVALID',
    });
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: secureValue === 'true',
    auth: { user, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM?.trim() || `KindMetrics <${user}>`,
      to: correoDestino,
      subject: 'Instrucciones para recuperar tu contraseña de KindMetrics',
      text: [
        'Recibimos una solicitud para recuperar tu contraseña de KindMetrics.',
        '',
        `Abre la página de recuperación de KindMetrics: ${recoveryUrl}`,
        `Ingresa este código de verificación en KindMetrics: ${token}`,
        'Valida el código y define tu nueva contraseña directamente en KindMetrics.',
        '',
        'El código vence en 10 minutos y solo puede utilizarse una vez.',
        'Si no solicitaste este cambio, ignora este correo.',
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="color:#0f172a;">Recupera tu contraseña de KindMetrics</h2>
          <p>Recibimos una solicitud para recuperar el acceso a tu cuenta.</p>
          <p>Abre la página de KindMetrics y continúa allí con la recuperación:</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${escapeHtml(recoveryUrl)}" style="display:inline-block;background:#0f2d3d;color:#fff;text-decoration:none;padding:14px 24px;border-radius:6px;font-weight:700;">Continuar en KindMetrics</a>
          </p>
          <p>Ingresa este código de verificación en la página:</p>
          <div style="font-size:32px;letter-spacing:6px;font-weight:700;background:#f1f5f9;padding:18px 24px;border-radius:10px;text-align:center;color:#111827;margin:20px 0;">${escapeHtml(token)}</div>
          <p>El código vence en 10 minutos y solo puede utilizarse una vez.</p>
          <p style="color:#64748b;font-size:12px;">Si tú no solicitaste este cambio, ignora este correo.</p>
        </div>
      `,
    });
  } catch (error) {
    const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    const responseCode = error && typeof error === 'object' && 'responseCode' in error ? error.responseCode : undefined;

    if (errorCode === 'EAUTH' || responseCode === 534 || responseCode === 535) {
      throw new AppError(
        'Gmail rechazó la autenticación SMTP. Genera una contraseña de aplicación en la misma cuenta indicada en MAIL_USER; no uses la contraseña normal ni una clave generada para otra cuenta. Guarda MAIL_USER y MAIL_PASS en .env.dev y reinicia la API.',
        {
          statusCode: 503,
          code: 'MAIL_AUTH_FAILED',
          cause: error,
        },
      );
    }

    if (errorCode === 'EENVELOPE' || responseCode === 550 || responseCode === 553) {
      throw new AppError('Gmail rechazó la dirección del remitente o destinatario.', {
        statusCode: 503,
        code: 'MAIL_ADDRESS_REJECTED',
        cause: error,
      });
    }

    throw new AppError('No se pudo enviar el correo de recuperación mediante Gmail SMTP.', {
      statusCode: 503,
      code: 'MAIL_DELIVERY_FAILED',
      cause: error,
    });
  } finally {
    transporter.close();
  }
}
