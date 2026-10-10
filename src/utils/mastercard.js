/**
 * Mastercard-only checks. Never log the full number.
 */

export const MIN_WITHDRAWAL_IQD = 1000;

export const normalizeCardNumber = (value = '') => String(value).replace(/\D/g, '');

const luhnOk = (digits) => {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};

export const isMastercardNumber = (value) => {
  const digits = normalizeCardNumber(value);
  if (digits.length < 13 || digits.length > 19) return false;
  const bin2 = Number(digits.slice(0, 2));
  const bin4 = Number(digits.slice(0, 4));
  const mastercard = (bin2 >= 51 && bin2 <= 55) || (bin4 >= 2221 && bin4 <= 2720);
  return mastercard && luhnOk(digits);
};

export const maskCard = (value) => {
  const digits = normalizeCardNumber(value);
  return digits.slice(-4);
};

/**
 * Iraqi mobile number used by Zain Cash / Asia Hawala wallets.
 * Accepts 07xxxxxxxxx, 7xxxxxxxxx, +964 7xxxxxxxxx, 00964 7xxxxxxxxx → returns 07xxxxxxxxx or null.
 */
export const normalizeIraqiWalletNumber = (value = '') => {
  let digits = String(value).replace(/\D/g, '');
  if (digits.startsWith('00964')) digits = digits.slice(5);
  else if (digits.startsWith('964')) digits = digits.slice(3);
  if (digits.length === 10 && digits.startsWith('7')) digits = `0${digits}`;
  return /^07\d{9}$/.test(digits) ? digits : null;
};

export const WITHDRAWAL_METHODS = {
  mastercard: 'ماستركارد',
  zaincash: 'زين كاش',
  asiahawala: 'آسيا حوالة',
};

export const isValidExpiry = (value = '') => /^\d{2}\/\d{2}$/.test(String(value).trim());
