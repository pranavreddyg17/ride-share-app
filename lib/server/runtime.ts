import { env } from 'cloudflare:workers';
import type { Role } from '../types';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const db = () => {
  if (!env.DB)
    throw new ApiError(
      503,
      'The pilot database is unavailable. Please try again.',
    );
  return env.DB;
};
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export type Context = {
  userId: string;
  grantId: string;
  requestId: string;
  action?: string;
  entityKind?: string;
  entityId?: string;
  writes: D1PreparedStatement[];
  after: D1PreparedStatement[];
  workspace: string;
  demo: boolean;
  role: Role;
  recordId: string | null;
  name: string;
  email: string;
};
