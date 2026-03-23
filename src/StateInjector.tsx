import { useEffect, useRef, type ReactNode } from 'react';
import * as Linking from 'expo-linking';
import { getScenario, getAllScenarios } from './registry';

let expoRouter: { router: { push: (route: string) => void } } | null = null;
try {
  expoRouter = require('expo-router');
} catch {
  // expo-router not available
}

export interface StateInjectorProps {
  children: ReactNode;
  onNavigate?: (route: string) => void;
}

const VALID_ID_PATTERN = /^[a-zA-Z0-9_\-/]+$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeObject(obj: unknown): Record<string, unknown> | undefined {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const value = (obj as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function parsePreflightUrl(url: string): { id: string; state?: Record<string, unknown> } | null {
  const marker = 'preflight://scenario/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;

  const withoutScheme = url.slice(idx + marker.length);
  const qIdx = withoutScheme.indexOf('?');
  const id = qIdx === -1 ? withoutScheme : withoutScheme.slice(0, qIdx);
  const queryString = qIdx === -1 ? undefined : withoutScheme.slice(qIdx + 1);

  if (!id || !VALID_ID_PATTERN.test(id)) {
    console.warn('[preflight] Invalid scenario id in deep link');
    return null;
  }

  let state: Record<string, unknown> | undefined;
  if (queryString) {
    const params = new URLSearchParams(queryString);
    const stateParam = params.get('state');
    if (stateParam) {
      if (stateParam.length > 10000) {
        console.warn('[preflight] State param too large (max 10000 chars), ignoring');
        return { id };
      }
      try {
        const decoded = typeof atob === 'function'
          ? atob(stateParam)
          : Buffer.from(stateParam, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);
        state = sanitizeObject(parsed);
        if (!state) {
          console.warn('[preflight] State param must be a JSON object');
        }
      } catch {
        console.warn('[preflight] Failed to decode state param');
      }
    }
  }

  return { id, state };
}

let isHandling = false;
let _preflightActive = false;

/** Returns true when a preflight deep link has been handled. Use to bypass auth gates, onboarding, etc. */
export function isPreflightActive(): boolean {
  return _preflightActive;
}

async function handlePreflightUrl(url: string, navigate: (route: string) => void): Promise<void> {
  if (isHandling) return;
  isHandling = true;
  try {
    const parsed = parsePreflightUrl(url);
    if (!parsed) return;
    _preflightActive = true;

    const scenario = getScenario(parsed.id);
    if (!scenario) {
      const available = getAllScenarios().map(s => s.id).join(', ') || 'none';
      console.warn(`[preflight] Scenario "${parsed.id}" not found. Available: ${available}`);
      return;
    }

    if (scenario.inject) {
      try {
        await scenario.inject(parsed.state);
      } catch (error) {
        console.error(`[preflight] inject() failed for "${parsed.id}":`, error);
        return;
      }
    }

    navigate(scenario.route);
  } finally {
    isHandling = false;
  }
}

export function StateInjector({ children, onNavigate }: StateInjectorProps) {
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  useEffect(() => {
    const navigate = (route: string) => {
      if (navigateRef.current) {
        navigateRef.current(route);
        return;
      }
      if (!expoRouter) {
        console.warn('[preflight] expo-router not available. Provide an onNavigate prop to <StateInjector />.');
        return;
      }
      expoRouter.router.push(route);
    };

    Linking.getInitialURL()
      .then((url) => {
        if (url) handlePreflightUrl(url, navigate);
      })
      .catch((error) => {
        console.warn('[preflight] Failed to get initial URL:', error);
      });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handlePreflightUrl(url, navigate);
    });

    return () => subscription.remove();
  }, []);

  return <>{children}</>;
}
