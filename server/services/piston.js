/*
 * piston.js — Code execution, two-tier fallback.
 *
 * Primary: JDoodle (https://www.jdoodle.com) — requires a free account's
 * clientId/clientSecret in .env. Chosen as primary as of this session
 * because Piston's public instance now rejects /execute entirely:
 *   "Public Piston API is now whitelist only as of 2/15/2026."
 * (confirmed live — /runtimes still works openly, /execute does not).
 * Fallback: Piston (https://emkc.org/api/v2/piston) — kept wired and
 * fully implemented so flipping back to primary is a one-line change
 * (see executeCode) whenever a whitelisted key is obtained, or if this
 * project switches to self-hosting a Piston instance.
 */

const axios = require('axios');
const PISTON_URL = process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston';
const JDOODLE_URL = 'https://api.jdoodle.com/v1/execute';

// Language map: our schema enum → Piston language + version.
// Verified against the live GET /api/v2/piston/runtimes response on
// 2026-07-02 — these are the actual current versions, not guesses.
const PISTON_LANGUAGES = {
  javascript: { language: 'javascript', version: '18.15.0' },
  typescript: { language: 'typescript', version: '5.0.3' },
  python: { language: 'python', version: '3.10.0' },
  java: { language: 'java', version: '15.0.2' },
  c: { language: 'c', version: '10.2.0' },
  cpp: { language: 'c++', version: '10.2.0' },
  // HTML/CSS are not executable — handled client-side as a live preview
  // (Day 13 if time, otherwise skip; see CLAUDE.md scope notes)
};

// JDoodle language map (primary as of this session).
// Verified against LIVE requests once real credentials were added to
// .env — not guessed. Concretely: versionIndex '0' for python3 turned
// out to be an old Python that rejects f-strings ("Hello, {name}!" ->
// SyntaxError) — versionIndex '1' through at least '4' all correctly
// ran modern syntax, so '1' is used below as the lowest confirmed-modern
// index (keeps quota-friendly; there was no functional difference found
// between 1-4 in testing). nodejs versionIndex '0' was confirmed fine
// with template literals. java's versionIndex '0' was confirmed via a
// real compile+run. c/cpp17 were NOT reachable before JDoodle's 200/day
// free-tier quota was exhausted during this session's testing (see
// paper-notes.md Day 12) — left at '0' unverified; check these first if
// C/C++ execution ever fails.
const JDOODLE_LANGUAGES = {
  javascript: { language: 'nodejs', versionIndex: '0' },
  python: { language: 'python3', versionIndex: '1' },
  java: { language: 'java', versionIndex: '0' },
  c: { language: 'c', versionIndex: '0' }, // unverified — quota ran out before this could be tested live
  cpp: { language: 'cpp17', versionIndex: '0' }, // unverified — quota ran out before this could be tested live
  typescript: { language: 'typescript', versionIndex: '0' }, // unverified — quota ran out before this could be tested live
};

async function executeWithPiston(code, language, stdin = '') {
  const langConfig = PISTON_LANGUAGES[language];
  if (!langConfig) {
    throw new Error(`Language "${language}" is not supported by Piston`);
  }

  const response = await axios.post(
    `${PISTON_URL}/execute`,
    {
      language: langConfig.language,
      version: langConfig.version,
      files: [{ content: code }],
      stdin,
      run_timeout: 10000, // 10 second timeout
      compile_timeout: 30000,
    },
    { timeout: 15000 }
  );

  const result = response.data;
  const compile = result.compile;
  const run = result.run;

  // Compiled languages (java/c/cpp) can fail before ever reaching `run` —
  // Piston still returns 200 in that case, just with a non-zero
  // compile.code and the real error in compile.stderr. Without checking
  // this, a syntax error in Java/C/C++ would render as a silent, blank
  // "success" instead of showing the compiler's actual message.
  if (compile && compile.code !== 0) {
    return {
      success: true,
      stdout: compile.stdout || '',
      stderr: compile.stderr || 'Compilation failed',
      exitCode: compile.code,
      language,
      executionTime: null, // Piston doesn't return this
    };
  }

  return {
    success: true,
    stdout: run?.stdout || '',
    stderr: run?.stderr || '',
    exitCode: run?.code ?? 0,
    language,
    executionTime: null,
  };
}

async function executeWithJDoodle(code, language, stdin = '') {
  if (!process.env.JDOODLE_CLIENT_ID) {
    throw new Error('JDoodle not configured (JDOODLE_CLIENT_ID missing from .env)');
  }

  const langConfig = JDOODLE_LANGUAGES[language];
  if (!langConfig) {
    throw new Error(`Language "${language}" is not supported by JDoodle`);
  }

  const response = await axios.post(
    JDOODLE_URL,
    {
      clientId: process.env.JDOODLE_CLIENT_ID,
      clientSecret: process.env.JDOODLE_CLIENT_SECRET,
      script: code,
      stdin,
      language: langConfig.language,
      versionIndex: langConfig.versionIndex,
    },
    { timeout: 15000 }
  );

  const data = response.data;
  // JDoodle reports actual failures (bad clientId/secret, quota exceeded)
  // inside a 200 response body, not via HTTP status — `error` is
  // JDoodle's own field name for this (e.g. "Daily limit reached", seen
  // live while testing this session — the 200-executions/day free tier
  // is easy to exhaust with more than a couple dozen manual test runs).
  if (data.error) {
    throw new Error(data.error);
  }

  // JDoodle merges stdout+stderr into a single `output` field — it
  // doesn't separate them character-by-character the way Piston does.
  // What it DOES give us, confirmed via a live syntax-error request
  // during this session (undocumented in JDoodle's own published docs,
  // which don't mention this field at all), is `isExecutionSuccess`: a
  // real boolean, false for a Python SyntaxError with statusCode still
  // reported as 200. That's precise enough to route the whole blob to
  // stderr instead of stdout when the run actually failed, rather than
  // showing a compiler/interpreter error in the "STDOUT" section.
  const failed = data.isExecutionSuccess === false;

  return {
    success: true,
    stdout: failed ? '' : data.output || '',
    stderr: failed ? data.output || '' : '',
    exitCode: failed ? 1 : 0,
    language,
    executionTime: data.cpuTime ? Number(data.cpuTime) * 1000 : null, // JDoodle reports cpuTime in seconds
  };
}

async function executeCode(code, language, stdin = '') {
  let jdoodleErr = null;
  let pistonErr = null;

  // JDoodle first — see file header for why the usual Piston-primary
  // order is flipped right now.
  try {
    return await executeWithJDoodle(code, language, stdin);
  } catch (err) {
    jdoodleErr = err;
    console.warn('JDoodle execution failed, trying Piston:', err.message);
  }

  try {
    return await executeWithPiston(code, language, stdin);
  } catch (err) {
    pistonErr = err;
    console.warn('Piston execution also failed:', err.message);
  }

  return {
    success: false,
    error: `Both JDoodle and Piston execution failed. JDoodle: ${jdoodleErr.message} — Piston: ${pistonErr.message}`,
  };
}

// Get list of supported runtimes from Piston (useful for verifying
// version strings on startup — this endpoint is still open even though
// /execute is whitelist-only now).
async function getPistonRuntimes() {
  try {
    const response = await axios.get(`${PISTON_URL}/runtimes`, { timeout: 5000 });
    return response.data;
  } catch (err) {
    console.warn('Could not fetch Piston runtimes:', err.message);
    return [];
  }
}

module.exports = { executeCode, getPistonRuntimes, PISTON_LANGUAGES };
