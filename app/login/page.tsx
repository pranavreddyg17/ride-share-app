import { chatGPTSignInPath, getChatGPTUser } from '../chatgpt-auth';
import { Brand } from '../shell';
import {
  ShieldCheck,
  ArrowRight,
  CarFront,
  Users,
  GraduationCap,
} from 'lucide-react';
export const dynamic = 'force-dynamic';
export default async function Login() {
  const user = await getChatGPTUser();
  return (
    <main className="login">
      <section className="login-brand">
        <Brand />
        <h1>
          A little drive.
          <br />A world of
          <br />
          <em>possibility.</em>
        </h1>
        <p>
          Connecting North Texas students to sports, learning, and everything
          they can become.
        </p>
        <div
          style={{ display: 'flex', gap: 18, marginTop: 38, color: '#6ecbbb' }}
        >
          <CarFront />
          <Users />
          <GraduationCap />
        </div>
        <small style={{ marginTop: 50, color: '#7f9bab' }}>
          KINETIC YOUTH · NORTH TEXAS PILOT
        </small>
      </section>
      <section className="login-form">
        <span className="eyebrow" style={{ marginBottom: 18 }}>
          YOUR COMMUNITY. IN MOTION.
        </span>
        <h2>Welcome to Kinetic Youth</h2>
        <p>
          One place for coordinators, volunteer drivers, and families to keep
          every ride connected.
        </p>
        <a
          className="btn primary"
          target="_top"
          href={user ? '/?mode=pilot' : chatGPTSignInPath('/?mode=pilot')}
        >
          Continue to your pilot
          <ArrowRight />
        </a>
        <a
          className="btn"
          target="_top"
          href={user ? '/?mode=practice' : chatGPTSignInPath('/?mode=practice')}
        >
          Explore the practice workspace
        </a>
        <div className="notice" style={{ marginTop: 22 }}>
          <ShieldCheck />
          <span>
            Secure sign-in with ChatGPT. Your coordinator assigns access to the
            admin, driver, or family portal using your verified email.
          </span>
        </div>
        <p style={{ fontSize: 12, marginTop: 24 }}>
          Practice mode uses fictional people and rides. Sign-in uses your
          ChatGPT account. Ride text alerts require coordinator setup.
        </p>
        {user && (
          <div style={{ fontSize: 12, color: '#768c99' }}>
            Signed in as {user.email}.{' '}
            {/* Authentication is handled by the gateway and requires a full navigation. */}
            {/* eslint-disable-next-line next/no-html-link-for-pages */}
            <a
              href="/signout-with-chatgpt?return_to=%2Flogin"
              target="_top"
              style={{ color: '#177f72' }}
            >
              Sign out
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
