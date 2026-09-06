import { GoogleGenAI } from "@google/genai";

/**
 * Lazily constructed Gemini client.
 *
 * The two AI services used to build a GoogleGenAI instance at module scope.
 * That constructor throws when no key is present, and because it ran during
 * module evaluation the exception escaped before React could mount — so an
 * app with no API key rendered a blank page rather than degrading to its
 * offline features. Nothing here runs until a call site actually asks for the
 * client, so the sequencer works with no key at all and only the AI buttons
 * are unavailable.
 *
 * The key is kept in localStorage. Be aware that any Gemini key used from a
 * browser is exposed to whoever is using that browser and travels in requests
 * the user can inspect: this is a client-side-only tool, so use a restricted
 * or throwaway key rather than one attached to meaningful billing.
 */

const STORAGE_KEY = 'neoncatafalque.gemini-api-key';

export class MissingApiKeyError extends Error {
  constructor() {
    super('No Gemini API key set. Paste one in the AI panel to enable AI features.');
    this.name = 'MissingApiKeyError';
  }
}

/**
 * Key injected at build time by vite's `define`. When GEMINI_API_KEY is unset
 * this compiles to a bare `undefined`, and in a plain static host `process`
 * may not exist at all — both cases have to be survivable, not thrown.
 */
function injectedKey(): string {
  try {
    return (process.env.API_KEY as string | undefined) ?? '';
  } catch {
    return '';
  }
}

function storedKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // Private browsing and blocked-cookie modes throw on access.
    return '';
  }
}

let cachedKey: string | null = null;
let client: GoogleGenAI | null = null;
const listeners = new Set<() => void>();

export function getApiKey(): string {
  if (cachedKey === null) cachedKey = storedKey() || injectedKey();
  return cachedKey;
}

export function hasApiKey(): boolean {
  return getApiKey().trim().length > 0;
}

export function setApiKey(key: string): void {
  const trimmed = key.trim();
  cachedKey = trimmed;
  client = null; // force a rebuild with the new key
  try {
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Key still works for this session even if it cannot be persisted.
  }
  listeners.forEach((fn) => fn());
}

export function clearApiKey(): void {
  setApiKey('');
}

/** Notifies subscribers whenever the key changes, so the UI can re-enable. */
export function subscribeToApiKey(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getGeminiClient(): GoogleGenAI {
  const key = getApiKey();
  if (!key) throw new MissingApiKeyError();
  if (!client) client = new GoogleGenAI({ apiKey: key });
  return client;
}
