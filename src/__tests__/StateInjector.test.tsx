import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { StateInjector } from '../StateInjector';
import { registerScenario, clearRegistry } from '../registry';

const mockAddEventListener = jest.fn((_event: string, _handler: (e: { url: string }) => void) => ({ remove: jest.fn() }));
const mockGetInitialURL = jest.fn<Promise<string | null>, []>(() => Promise.resolve(null));
jest.mock('expo-linking', () => ({
  addEventListener: (event: string, handler: (e: { url: string }) => void) => mockAddEventListener(event, handler),
  getInitialURL: () => mockGetInitialURL(),
}));

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (route: string) => mockRouterPush(route) },
}));

afterEach(() => {
  clearRegistry();
  jest.clearAllMocks();
});

test('renders children', () => {
  const { getByText } = render(
    <StateInjector><Text>Child</Text></StateInjector>
  );
  expect(getByText('Child')).toBeTruthy();
});

test('does nothing when registry is empty', () => {
  render(<StateInjector><Text>App</Text></StateInjector>);
  expect(mockRouterPush).not.toHaveBeenCalled();
});

test('calls inject and navigates on preflight deep link', async () => {
  const inject = jest.fn();
  registerScenario({ id: 'test', route: '/test', inject });
  mockGetInitialURL.mockResolvedValueOnce('preflight://scenario/test');

  render(<StateInjector><Text>App</Text></StateInjector>);

  await waitFor(() => {
    expect(inject).toHaveBeenCalledWith(undefined);
    expect(mockRouterPush).toHaveBeenCalledWith('/test');
  });
});

test('decodes base64 state and passes to inject', async () => {
  const inject = jest.fn();
  registerScenario({ id: 'test', route: '/test', inject });
  const state = { bike: { weight: 200 } };
  const encoded = btoa(JSON.stringify(state));
  mockGetInitialURL.mockResolvedValueOnce(`preflight://scenario/test?state=${encoded}`);

  render(<StateInjector><Text>App</Text></StateInjector>);

  await waitFor(() => {
    expect(inject).toHaveBeenCalledWith(state);
  });
});

test('ignores non-preflight deep links', async () => {
  mockGetInitialURL.mockResolvedValueOnce('myapp://home');
  render(<StateInjector><Text>App</Text></StateInjector>);

  await waitFor(() => {});
  expect(mockRouterPush).not.toHaveBeenCalled();
});

test('handles getInitialURL rejection gracefully', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation();
  mockGetInitialURL.mockRejectedValueOnce(new Error('linking error'));

  render(<StateInjector><Text>App</Text></StateInjector>);

  await waitFor(() => {
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to get initial URL'),
      expect.any(Error),
    );
  });
  expect(mockRouterPush).not.toHaveBeenCalled();
  warn.mockRestore();
});

test('does not navigate when inject rejects', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation();
  const inject = jest.fn().mockRejectedValueOnce(new Error('inject failed'));
  registerScenario({ id: 'fail-inject', route: '/fail-inject', inject });
  mockGetInitialURL.mockResolvedValueOnce('preflight://scenario/fail-inject');

  render(<StateInjector><Text>App</Text></StateInjector>);

  await waitFor(() => {
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('inject() failed'),
      expect.any(Error),
    );
  });
  expect(mockRouterPush).not.toHaveBeenCalled();
  error.mockRestore();
});

test('handles malformed base64 state gracefully', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation();
  const inject = jest.fn();
  registerScenario({ id: 'bad-state', route: '/bad-state', inject });
  mockGetInitialURL.mockResolvedValueOnce('preflight://scenario/bad-state?state=NOT_VALID!!!');

  render(<StateInjector><Text>App</Text></StateInjector>);

  await waitFor(() => {
    expect(inject).toHaveBeenCalledWith(undefined);
    expect(mockRouterPush).toHaveBeenCalledWith('/bad-state');
  });
  warn.mockRestore();
});

test('uses onNavigate prop instead of expo-router', async () => {
  const onNavigate = jest.fn();
  const inject = jest.fn();
  registerScenario({ id: 'custom-nav', route: '/custom-nav', inject });
  mockGetInitialURL.mockResolvedValueOnce('preflight://scenario/custom-nav');

  render(<StateInjector onNavigate={onNavigate}><Text>App</Text></StateInjector>);

  await waitFor(() => {
    expect(inject).toHaveBeenCalledWith(undefined);
    expect(onNavigate).toHaveBeenCalledWith('/custom-nav');
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

test('handles variant IDs with slashes in deep link', async () => {
  const inject = jest.fn();
  registerScenario({ id: 'profile/logged-in', route: '/profile', inject });
  mockGetInitialURL.mockResolvedValueOnce('preflight://scenario/profile/logged-in');

  render(<StateInjector><Text>App</Text></StateInjector>);

  await waitFor(() => {
    expect(inject).toHaveBeenCalledWith(undefined);
    expect(mockRouterPush).toHaveBeenCalledWith('/profile');
  });
});

test('sanitizes prototype pollution keys from state (deep)', async () => {
  const inject = jest.fn();
  registerScenario({ id: 'safe', route: '/safe', inject });
  const malicious = { name: 'Alice', __proto__: { admin: true }, nested: { constructor: {}, value: 42 } };
  const encoded = btoa(JSON.stringify(malicious));
  mockGetInitialURL.mockResolvedValueOnce(`preflight://scenario/safe?state=${encoded}`);

  render(<StateInjector><Text>App</Text></StateInjector>);

  await waitFor(() => {
    const state = inject.mock.calls[0]![0];
    expect(state).toBeDefined();
    expect(state.name).toBe('Alice');
    expect(Object.keys(state)).not.toContain('__proto__');
    expect(Object.keys(state.nested)).not.toContain('constructor');
    expect(state.nested?.value).toBe(42);
  });
});

test('rejects invalid deep link IDs', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation();
  mockGetInitialURL.mockResolvedValueOnce('preflight://scenario/../../etc/passwd');

  render(<StateInjector><Text>App</Text></StateInjector>);

  await waitFor(() => {
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid scenario id'));
  });
  expect(mockRouterPush).not.toHaveBeenCalled();
  warn.mockRestore();
});

test('warns when scenario not found in registry', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation();
  mockGetInitialURL.mockResolvedValueOnce('preflight://scenario/nonexistent');

  render(<StateInjector><Text>App</Text></StateInjector>);

  await waitFor(() => {
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent'),
    );
  });
  expect(mockRouterPush).not.toHaveBeenCalled();
  warn.mockRestore();
});
