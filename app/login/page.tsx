import { chatGPTSignInPath, getChatGPTUser } from '../chatgpt-auth';
import { Brand } from '../shell';
import { ArrowRight } from 'lucide-react';
export const dynamic = 'force-dynamic';
export default async function Login() {
  const user = await getChatGPTUser();
  return (
    <main className="login-v2">
      <section className="login-visual">
        <Brand />
        {/* Static local artwork; not an interactive or tracked vehicle. */}
        {/* eslint-disable-next-line next/no-img-element */}
        <img
          src="/vehicle-render.png"
          width={1536}
          height={1024}
          alt="Black compact car and a pickup marker on a route platform"
        />
        <div className="login-caption">
          <span>North Texas</span>
          <span>Community transportation</span>
        </div>
      </section>
      <section className="login-panel">
        <h1>{user ? 'Your account' : 'Sign in'}</h1>
        <p>
          Rides, driver schedules, and service records.
          <br />
          Use the email registered by your coordinator.
        </p>
        <a
          className="btn primary"
          target="_top"
          href={user ? '/?mode=pilot' : chatGPTSignInPath('/?mode=pilot')}
        >
          {user ? 'Open pilot workspace' : 'Continue with ChatGPT'}
          <ArrowRight size={18} />
        </a>
        <a
          className="btn"
          target="_top"
          href={
            user
              ? '/?mode=practice&viewAs=admin'
              : chatGPTSignInPath('/?mode=practice&viewAs=admin')
          }
        >
          Open practice workspace
          <ArrowRight size={18} />
        </a>
        <p className="account-note">
          Admin, driver, and family access is assigned by the coordinator.
          Practice uses sample records.
        </p>
        {user && (
          <p className="account-note">
            {user.email}
            <br />
            {/* eslint-disable-next-line next/no-html-link-for-pages */}
            <a href="/signout-with-chatgpt?return_to=%2Flogin" target="_top">
              Sign out
            </a>
          </p>
        )}
      </section>
    </main>
  );
}
