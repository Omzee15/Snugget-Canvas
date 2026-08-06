// Local, offline-safe icons for the built-in PRESETS list (see apps.ts).
// These are original line-art glyphs evoking each service, not copies of
// its trademarked logo — bundling exact brand artwork locally isn't
// something to redistribute from here. Keyed by the preset's exact URL so
// a favourite created from a preset picks up the same icon.
import type { ReactNode } from 'react';

const stroke = (children: ReactNode) => (
  <svg
    className="palette-app-icon"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const GMAIL = stroke(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </>
);

const CALENDAR = stroke(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
  </>
);

const DOCS = stroke(
  <>
    <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v4h4" />
    <path d="M9 13h6" />
    <path d="M9 17h6" />
  </>
);

const NOTION = stroke(
  <>
    <path d="M6 4v16" />
    <path d="M18 4v16" />
    <path d="M6 4l12 16" />
  </>
);

const GITHUB = stroke(
  <>
    <circle cx="6" cy="6" r="2.3" />
    <circle cx="6" cy="18" r="2.3" />
    <circle cx="18" cy="6" r="2.3" />
    <path d="M6 8.3v7.4" />
    <path d="M18 8.3a6 6 0 0 1-6 6h-.5" />
  </>
);

const YOUTUBE = stroke(
  <>
    <rect x="2" y="5" width="20" height="14" rx="4" />
    <path d="M10 9.2 15.5 12 10 14.8Z" fill="currentColor" stroke="none" />
  </>
);

const CHAT = stroke(
  <>
    <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Z" />
    <path d="M8 10h8" />
    <path d="M8 13h5" />
  </>
);

const SPARKLE = stroke(
  <>
    <path d="M12 3v4" />
    <path d="M12 17v4" />
    <path d="M3 12h4" />
    <path d="M17 12h4" />
    <path d="M5.6 5.6l2.8 2.8" />
    <path d="M15.6 15.6l2.8 2.8" />
    <path d="M18.4 5.6l-2.8 2.8" />
    <path d="M8.4 15.6l-2.8 2.8" />
  </>
);

const PEN = stroke(<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />);

const AUDIO_BARS = stroke(
  <>
    <path d="M4 14v3" />
    <path d="M9 10v10" />
    <path d="M14 6v16" />
    <path d="M19 11v8" />
  </>
);

const X_MARK = stroke(
  <>
    <path d="M5 5l14 14" />
    <path d="M19 5 5 19" />
  </>
);

const UPVOTE = stroke(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8" />
    <path d="m8 12 4-4 4 4" />
  </>
);

const BOOK = stroke(
  <>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5Z" />
    <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5Z" />
  </>
);

const PIN = stroke(
  <>
    <path d="M12 22s7-7.58 7-12A7 7 0 0 0 5 10c0 4.42 7 12 7 12Z" />
    <circle cx="12" cy="10" r="2.5" />
  </>
);

export const PRESET_ICONS: Record<string, ReactNode> = {
  'https://mail.google.com': GMAIL,
  'https://calendar.google.com': CALENDAR,
  'https://docs.google.com': DOCS,
  'https://www.notion.so': NOTION,
  'https://github.com': GITHUB,
  'https://www.youtube.com': YOUTUBE,
  'https://chatgpt.com': CHAT,
  'https://claude.ai': SPARKLE,
  'https://www.figma.com': PEN,
  'https://open.spotify.com': AUDIO_BARS,
  'https://x.com': X_MARK,
  'https://www.reddit.com': UPVOTE,
  'https://www.wikipedia.org': BOOK,
  'https://maps.google.com': PIN
};
