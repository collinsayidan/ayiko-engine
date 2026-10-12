import { LogoMark } from "@/components/Icons";
import "./studio.css";

export default function NotFound() {
  return (
    <main className="auth">
      <a className="logo" href="/" aria-label="Ayiko home"><LogoMark /><span>ayiko<em>.ai</em></span></a>
      <div className="auth-card">
        <h1>Page not found</h1>
        <p className="muted">That page doesn&apos;t exist, or the link was cut short.</p>
        <a className="btn wide" href="/app">Go to the studio</a>
        <a className="linkish" href="/">Back to the home page</a>
      </div>
    </main>
  );
}
