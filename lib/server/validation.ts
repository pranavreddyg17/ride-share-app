import { ApiError } from './runtime';
export const txt = (v: unknown, min = 1, max = 200) => {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max)
    throw new ApiError(
      400,
      `Please enter ${min}–${max} characters in every required field.`,
    );
  return v.trim();
};
export const email = (v: unknown) => {
  const e = txt(v, 5, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    throw new ApiError(400, 'Enter a valid email address.');
  return e;
};
export const phone = (v: unknown, optional = false) => {
  if (optional && !v) return '';
  const p = txt(v, 10, 20).replace(/[\s().-]/g, '');
  if (!/^\+1\d{10}$/.test(p))
    throw new ApiError(
      400,
      'Use a US phone number with country code, such as +12145550123.',
    );
  return p;
};
export const bool = (v: unknown) => v === true;
export function details(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new ApiError(400, 'Record details must be a JSON object.');
  return v as Record<string, unknown>;
}
export function checkVersion(
  body: Record<string, unknown>,
  old: { version: number } | null,
) {
  if (!old) return;
  if (!Number.isInteger(body.version))
    throw new ApiError(
      400,
      'A record version is required. Close and reopen this form.',
    );
  if (body.version !== old.version)
    throw new ApiError(
      409,
      'This record changed. Close and reopen the form before saving.',
    );
}
export function day(v: unknown) {
  const s = txt(v, 10, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new ApiError(400, 'Enter a valid date.');
  return s;
}
export function number(v: unknown, min: number, max: number) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    throw new ApiError(400, 'Enter a number within the allowed range.');
  return v;
}
