import { getChatGPTUser } from './chatgpt-auth';
import { redirect } from 'next/navigation';
import { PilotApp } from './pilot-app';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (!(await getChatGPTUser())) redirect('/login');
  return <PilotApp />;
}
