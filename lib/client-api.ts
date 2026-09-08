export async function postMutation(
  demo: boolean,
  role: string,
  body: Record<string, unknown>,
) {
  const key = crypto.randomUUID();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(
        `/api/state?mode=${demo ? 'practice' : 'pilot'}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ky-role': role,
            'Idempotency-Key': key,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        },
      );
      const result = (await res.json()) as {
        message: string;
        id?: string;
        error?: string;
      };
      if (res.status >= 500 && attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 400 * (attempt + 1)),
        );
        continue;
      }
      if (!res.ok)
        throw new MutationError(
          result.error ?? 'The change could not be saved.',
          res.status,
        );
      return result;
    } catch (e) {
      if (e instanceof MutationError || attempt === 2) throw e;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw new Error('Connection lost. Refresh the ride before trying again.');
}
class MutationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
