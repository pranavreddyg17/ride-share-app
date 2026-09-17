import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export type AuthenticatedUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

// Your identity gateway must strip these headers from client requests and add
// verified values before forwarding traffic to the application.
const USER_ID_HEADER = 'x-ky-authenticated-user-id';
const USER_EMAIL_HEADER = 'x-ky-authenticated-user-email';
const USER_FULL_NAME_HEADER = 'x-ky-authenticated-user-full-name';
const USER_FULL_NAME_ENCODING_HEADER =
  'x-ky-authenticated-user-full-name-encoding';
const PERCENT_ENCODED_UTF8 = 'percent-encoded-utf-8';
const SIGN_IN_PATH = process.env.KY_SIGN_IN_PATH ?? '/auth/sign-in';
const SIGN_OUT_PATH = process.env.KY_SIGN_OUT_PATH ?? '/auth/sign-out';
const CALLBACK_PATH = '/callback';

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    userId,
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export async function requireAuthenticatedUser(
  returnTo: string,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (user) return user;
  redirect(signInPath(returnTo));
}

export function signInPath(returnTo: string): string {
  return (
    SIGN_IN_PATH +
    '?return_to=' +
    encodeURIComponent(safeRelativeReturnPath(returnTo))
  );
}

export function signOutPath(returnTo = '/'): string {
  return (
    SIGN_OUT_PATH +
    '?return_to=' +
    encodeURIComponent(safeRelativeReturnPath(returnTo))
  );
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';

  let url: URL;
  try {
    url = new URL(value, 'https://app.local');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://app.local') return '/';
  if (isReservedAuthPath(url.pathname)) return '/';

  return url.pathname + url.search + url.hash;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
