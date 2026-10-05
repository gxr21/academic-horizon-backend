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

export const isValidExpiry = (value = '') => /^\d{2}\/\d{2}$/.test(String(value).trim());
