const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const buildEmailVerificationEmail = ({ name, verifyUrl }) => {
  const safeName = escapeHtml(name || 'الطالب');
  const safeUrl = escapeHtml(verifyUrl);

  return {
    subject: 'فعّل حسابك — الأفق الأكاديمي',
    text: `مرحباً ${name || ''}\n\nأكّد بريدك الإلكتروني لتفعيل حسابك. الرابط صالح لمدة 24 ساعة:\n${verifyUrl}\n\nإذا لم تنشئ حساباً فتجاهل هذه الرسالة.`,
    html: `
      <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#F4F7FA;padding:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;">
          <tr>
            <td style="background:#1A5276;color:#fff;padding:28px 32px;">
              <h1 style="margin:0;font-size:22px;">الأفق الأكاديمي</h1>
              <p style="margin:8px 0 0;opacity:.85;">تأكيد البريد الإلكتروني</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#1A2A36;line-height:1.9;">
              <p>مرحباً ${safeName}،</p>
              <p>شكراً لانضمامك. اضغط الزر أدناه لتأكيد أن هذا البريد لك وتفعيل حسابك. الرابط صالح لمدة 24 ساعة.</p>
              <p style="text-align:center;padding:18px 0;">
                <a href="${safeUrl}" style="background:#1A5276;color:#fff;text-decoration:none;padding:14px 28px;border-radius:14px;display:inline-block;font-weight:bold;">تأكيد البريد وتفعيل الحساب</a>
              </p>
              <p style="font-size:13px;color:#5B6B76;">إذا لم تنشئ حساباً في الأفق الأكاديمي فتجاهل الرسالة، ولن يُفعَّل أي شيء.</p>
            </td>
          </tr>
        </table>
      </div>
    `,
  };
};
