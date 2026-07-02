// Cursor colors assigned dynamically to collaborators. Exact hex values from
// the design file's "PRESENCE — CURSOR COLORS" swatch (6 colors, in order).
export const CURSOR_COLORS = [
  { bg: '#2dd4bf', label: 'teal' },
  { bg: '#fb7185', label: 'coral' },
  { bg: '#a78bfa', label: 'purple' },
  { bg: '#fbbf24', label: 'amber' },
  { bg: '#4ade80', label: 'green' },
  { bg: '#f472b6', label: 'pink' },
]

export const LANGUAGE_COLORS = {
  javascript: 'badge-js',
  python: 'badge-python',
  java: 'badge-java',
  cpp: 'badge-cpp',
  html: 'badge-html',
  css: 'badge-css',
  typescript: 'badge-js',
  plaintext: 'badge-css',
}

// Per-language dot/icon color. javascript/python/java/cpp/html/css are the
// exact base hex the design file's badge rgba tokens were derived from.
// c/json/markdown/plaintext aren't shown anywhere in the design file —
// inferred from common language-color conventions (e.g. GitHub linguist).
export const LANGUAGE_DOT_COLORS = {
  javascript: '#f0db4f',
  typescript: '#f0db4f',
  python: '#3572a5',
  java: '#b07219',
  c: '#555555',
  cpp: '#8250df',
  html: '#e34c26',
  css: '#2965f1',
  json: '#cbcb41',
  markdown: '#083fa1',
  plaintext: '#6b6b6b',
}

// Full language list for the TopBar dropdown + which ones the Run button
// can actually execute (Day 12 — matches server/services/piston.js's
// PISTON_LANGUAGES / JDOODLE_LANGUAGES keys exactly; HTML/CSS/JSON/
// Markdown/Plain Text have no runtime, so they're listed but not
// executable — a live preview for HTML/CSS is explicitly out of scope,
// see paper-notes.md Day 12).
export const LANGUAGE_OPTIONS = [
  { value: 'javascript', label: 'JavaScript', executable: true },
  { value: 'typescript', label: 'TypeScript', executable: true },
  { value: 'python', label: 'Python', executable: true },
  { value: 'java', label: 'Java', executable: true },
  { value: 'c', label: 'C', executable: true },
  { value: 'cpp', label: 'C++', executable: true },
  { value: 'html', label: 'HTML', executable: false },
  { value: 'css', label: 'CSS', executable: false },
  { value: 'json', label: 'JSON', executable: false },
  { value: 'markdown', label: 'Markdown', executable: false },
  { value: 'plaintext', label: 'Plain Text', executable: false },
]

export const EXECUTABLE_LANGUAGES = LANGUAGE_OPTIONS.filter((l) => l.executable).map((l) => l.value)
