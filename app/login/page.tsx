import { ArrowRight, CheckCircle2, Cloud, LockKeyhole, Orbit as OrbitIcon, ShieldCheck } from "lucide-react";
import { safeReturnTo } from "../../lib/orbit-auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);

  return (
    <main className="login-shell">
      <section className="login-story" aria-label="Orbit overview">
        <div className="login-brand"><span className="brand-mark" aria-hidden="true"><span /><i /></span><strong>Orbit</strong></div>
        <div className="login-story-copy">
          <p className="eyebrow">Your private workspace</p>
          <h1>Make progress feel inevitable.</h1>
          <p>Sign in to enter a calm space for your tasks, projects, and focused work.</p>
        </div>
        <div className="login-proof">
          <span><CheckCircle2 size={17} /> Account-specific tasks</span>
          <span><OrbitIcon size={17} /> Separate project spaces</span>
          <span><ShieldCheck size={17} /> Secure session cookie</span>
        </div>
        <div className="login-orbit-art" aria-hidden="true"><span /><i /><b /></div>
      </section>

      <section className="login-panel">
        <form className="login-card" action="/api/auth/login" method="post">
          <div className="login-lock"><LockKeyhole size={22} /></div>
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to Orbit</h2>
          <p className="login-intro">Your work stays private to your account and follows you across devices.</p>
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="field-label">Username<input name="username" defaultValue="aj.miller" autoComplete="username" autoFocus required /></label>
          <label className="field-label">Password<input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required /></label>
          {query.error === "invalid" && <p className="login-error" role="alert">The username or password is incorrect. Please try again.</p>}
          <button className="login-submit" type="submit">Sign in <ArrowRight size={18} /></button>
          <p className="login-device-note"><Cloud size={15} /> Tasks and projects sync securely anywhere you sign in.</p>
        </form>
      </section>
    </main>
  );
}
