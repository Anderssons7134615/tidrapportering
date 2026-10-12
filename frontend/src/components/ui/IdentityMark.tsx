const identityTones = ['identity-tone-0', 'identity-tone-1', 'identity-tone-2', 'identity-tone-3', 'identity-tone-4'];

/** Local, deterministic identity cues. Names remain visible alongside the mark. */
export function IdentityMark({ name, identity = name, person = false }: { name: string; identity?: string; person?: boolean }) {
  const initials = name.trim().split(/\s+/).filter((part) => /[\p{L}\p{N}]/u.test(part)).slice(0, 2).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase('sv-SE');
  const tone = Array.from(identity).reduce((value, character) => (value + character.codePointAt(0)!) % 5, 0);
  return <span aria-hidden="true" className={`identity-mark ${identityTones[tone]}${person ? ' identity-person' : ''}`}>{initials || '·'}</span>;
}

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M11 7v15a5 5 0 0 0 5 5h5M6 13h19" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /><path d="M23 5v3" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity=".5" /></svg></span>;
}
