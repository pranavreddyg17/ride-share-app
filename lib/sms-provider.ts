export type SmsCredentials = {
  account: string;
  token: string;
  service: string;
};
const headers = (c: SmsCredentials) => ({
  Authorization: 'Basic ' + btoa(`${c.account}:${c.token}`),
});
export async function sendSms(
  c: SmsCredentials,
  phone: string,
  body: string,
  send: typeof fetch = fetch,
) {
  try {
    const res = await send(
      `https://api.twilio.com/2010-04-01/Accounts/${c.account}/Messages.json`,
      {
        method: 'POST',
        headers: {
          ...headers(c),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          MessagingServiceSid: c.service,
          Body: body,
          ValidityPeriod: '900',
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    const value = (await res.json()) as { sid?: string; code?: number };
    const accepted = res.ok && /^SM[a-fA-F0-9]{32}$/.test(value.sid ?? '');
    return {
      status: accepted
        ? 'accepted'
        : res.status >= 400 && res.status < 500
          ? 'failed'
          : 'unknown',
      providerId: accepted ? value.sid! : null,
      error: accepted
        ? ''
        : `Provider request ${res.status}; code ${value.code ?? 'unknown'}`,
    };
  } catch {
    // A timeout can occur after provider acceptance. Automatic resend can duplicate an alert.
    return {
      status: 'unknown',
      providerId: null,
      error: 'No definitive provider response. Check delivery before retrying.',
    };
  }
}
export async function readSms(
  c: SmsCredentials,
  id: string,
  send: typeof fetch = fetch,
) {
  if (!/^SM[a-fA-F0-9]{32}$/.test(id))
    throw new Error('Invalid message identifier');
  const res = await send(
    `https://api.twilio.com/2010-04-01/Accounts/${c.account}/Messages/${id}.json`,
    {
      headers: headers(c),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!res.ok) throw new Error('Delivery status unavailable');
  const value = (await res.json()) as { status: string; error_code?: number };
  if (
    ![
      'delivered',
      'undelivered',
      'failed',
      'sent',
      'queued',
      'accepted',
      'canceled',
    ].includes(value.status)
  )
    throw new Error('Unrecognized delivery status');
  return {
    status: value.status,
    error: value.error_code ? `Provider error ${value.error_code}` : '',
  };
}
