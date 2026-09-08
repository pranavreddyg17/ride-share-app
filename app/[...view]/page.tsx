import { getChatGPTUser } from '../chatgpt-auth';
import { redirect } from 'next/navigation';
import { PilotApp } from '../pilot-app';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ view: string[] }>;
}) {
  const { view } = await params;
  if (!(await getChatGPTUser())) redirect('/login');
  return (
    <PilotApp
      initialPage={view[0]}
      initialRide={view[0] === 'rides' ? view[1] : undefined}
    />
  );
}
