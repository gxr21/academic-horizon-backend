import { Resend } from 'resend';
import { RESEND_API_KEY, RESEND_FROM_EMAIL, FRONTEND_URL } from '../config/env.js';
import { buildProviderWelcomeEmail } from '../emails/providerWelcome.js';
import { buildPasswordResetEmail } from '../emails/passwordReset.js';

const DEFAULT_FROM = 'الأفق الأكاديمي <onboarding@resend.dev>';

let resendClient = null;

const getApiKey = () => (RESEND_API_KEY || '').trim();

const getFromAddress = () => {
  const raw = (RESEND_FROM_EMAIL || '').trim();
  // Valid: "Name <email@domain>" or a plain email. The previous value mashed two addresses.
  if (/^[^<>]*<[^<>@\s]+@[^<>@\s]+>$/.test(raw) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return raw;
  }
  return DEFAULT_FROM;
};

const explainResendError = (message = '') => {
  if (message.includes('only send testing emails')) {
    return 'Resend في وضع التجربة ولا يرسل إلا إلى بريد حسابك. وثّق نطاقاً من resend.com/domains حتى تصل الرسالة لأي مزود.';
  }
  if (message.includes('domain')) {
    return 'عنوان المرسل غير موثّق عند Resend. استخدم نطاقاً موثّقاً في RESEND_FROM_EMAIL.';
  }
  return message || 'تعذر إرسال الرسالة عبر Resend';
};

const getResend = () => {
  const key = getApiKey();
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
};

/**
 * Send the provider welcome email. Never throws — account creation must succeed
 * even if Resend is missing or the inbox rejects the message.
 */
export const sendProviderWelcomeEmail = async ({ name, email, password }) => {
  const resend = getResend();
  if (!resend) {
    console.warn('Resend is not configured (RESEND_API_KEY). Skipped welcome email.');
    return { sent: false, reason: 'أضف RESEND_API_KEY في ملف البيئة ثم أعد تشغيل السيرفر.' };
  }

  const loginUrl = `${(FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}/login`;
  const { subject, html, text } = buildProviderWelcomeEmail({ name, email, loginUrl, password });

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [email],
      subject,
      html,
      text,
    });

    if (error) {
      console.error('Resend welcome email failed:', error);
      return { sent: false, reason: explainResendError(error.message) };
    }

    console.log(`📧 Welcome email sent to ${email} (${data?.id || 'ok'})`);
    return { sent: true, id: data?.id || null };
  } catch (error) {
    console.error('Resend welcome email failed:', error.message);
    return { sent: false, reason: explainResendError(error.message) };
  }
};

export const sendPasswordResetEmail = async ({ name, email, resetUrl }) => {
  const resend = getResend();
  if (!resend) {
    console.warn('Resend is not configured (RESEND_API_KEY). Skipped reset email.');
    return { sent: false, reason: 'أضف RESEND_API_KEY في ملف البيئة ثم أعد تشغيل السيرفر.' };
  }

  const { subject, html, text } = buildPasswordResetEmail({ name, resetUrl });

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [email],
      subject,
      html,
      text,
    });

    if (error) {
      console.error('Resend reset email failed:', error);
      return { sent: false, reason: explainResendError(error.message) };
    }

    console.log(`📧 Password reset email sent to ${email} (${data?.id || 'ok'})`);
    return { sent: true, id: data?.id || null };
  } catch (error) {
    console.error('Resend reset email failed:', error.message);
    return { sent: false, reason: explainResendError(error.message) };
  }
};
