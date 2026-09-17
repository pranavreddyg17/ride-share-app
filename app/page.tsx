import { getAuthenticatedUser } from './identity';
import { redirect } from 'next/navigation';
import { PilotApp } from './pilot-app';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (!(await getAuthenticatedUser())) redirect('/login');
  return <PilotApp />;
}
