import type { IconName } from "@/lib/content";

const PATHS: Record<IconName, React.ReactNode> = {
  bottle: (<><path d="M10 3h4v3h-4zM9 6h6l1 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9z" /><path d="M8 13h8" /></>),
  spark: (<><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 17l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>),
  ticket: (<><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z" /><path d="M14 7v10" strokeDasharray="2 2" /></>),
  mega: (<><path d="M4 10v4h3l7 4V6L7 10z" /><path d="M17 9a4 4 0 0 1 0 6" /></>),
  person: (<><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>),
  bowl: (<><path d="M3 12h18a9 9 0 0 1-18 0z" /><path d="M9 8c0-1.5 1-1.5 1-3M13 8c0-1.5 1-1.5 1-3" /></>),
  link: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  face: (<><circle cx="12" cy="10" r="5" /><path d="M10 9h.01M14 9h.01M10 12c1 1 3 1 4 0" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
};

export function TemplateIcon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>;
}

export function LogoMark() {
  return (
    <svg className="mark" viewBox="0 0 40 40" aria-hidden="true">
      <path className="bubble" d="M8 4h24a6 6 0 0 1 6 6v15a6 6 0 0 1-6 6H17l-8 7v-7H8a6 6 0 0 1-6-6V10a6 6 0 0 1 6-6z" />
      <path className="play" d="M15 11.5v12l10-6z" />
      <path className="wv" d="M28 13v9M31.5 15.5v4" fill="none" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
