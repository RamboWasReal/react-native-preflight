import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { scenario } from '../scenario';
import { getScenario, clearRegistry } from '../registry';

afterEach(() => {
  clearRegistry();
});

test('registers scenario in registry at call time', () => {
  scenario(
    { id: 'my-screen', route: '/my-screen', description: 'desc' },
    function MyScreen() { return <Text>Hello</Text>; }
  );
  const entry = getScenario('my-screen');
  expect(entry).toBeDefined();
  expect(entry?.route).toBe('/my-screen');
  expect(entry?.description).toBe('desc');
});

test('renders the wrapped component', () => {
  const Wrapped = scenario(
    { id: 'render-test', route: '/render-test' },
    function MyScreen() { return <Text>Content</Text>; }
  );
  const { getByText } = render(<Wrapped />);
  expect(getByText('Content')).toBeTruthy();
});

test('wraps component with testID View', () => {
  const Wrapped = scenario(
    { id: 'testid-test', route: '/testid-test' },
    function MyScreen() { return <Text>Inner</Text>; }
  );
  const { getByTestId } = render(<Wrapped />);
  expect(getByTestId('testid-test')).toBeTruthy();
});

test('passes inject function to registry', () => {
  const inject = jest.fn();
  scenario(
    { id: 'inject-test', route: '/inject-test', inject },
    function MyScreen() { return <Text>X</Text>; }
  );
  const entry = getScenario('inject-test');
  expect(entry?.inject).toBe(inject);
});

test('returns unwrapped component when id is empty', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation();
  function MyScreen() { return <Text>Hello</Text>; }
  const Result = scenario({ id: '', route: '/x' }, MyScreen);
  expect(Result).toBe(MyScreen);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('empty id'));
  warn.mockRestore();
});

test('returns unwrapped component when route is empty', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation();
  function MyScreen() { return <Text>Hello</Text>; }
  const Result = scenario({ id: 'no-route', route: '' }, MyScreen);
  expect(Result).toBe(MyScreen);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('without a route'));
  warn.mockRestore();
});

test('warns and skips registration for invalid id', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation();
  function MyScreen() { return <Text>Hello</Text>; }
  const Result = scenario({ id: 'invalid id!', route: '/x' }, MyScreen);
  expect(Result).toBe(MyScreen);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid id'));
  warn.mockRestore();
});

test('registers variants as separate scenarios', () => {
  const injectA = jest.fn();
  const injectB = jest.fn();
  scenario(
    {
      id: 'profile',
      route: '/profile',
      variants: {
        'logged-in': { inject: injectA },
        'logged-out': { inject: injectB },
      },
    },
    function Profile() { return <Text>Profile</Text>; }
  );
  expect(getScenario('profile')).toBeUndefined();
  expect(getScenario('profile/logged-in')).toBeDefined();
  expect(getScenario('profile/logged-out')).toBeDefined();
  expect(getScenario('profile/logged-in')?.inject).toBe(injectA);
  expect(getScenario('profile/logged-out')?.inject).toBe(injectB);
});

test('variant inherits base inject when not overridden', () => {
  const baseInject = jest.fn();
  scenario(
    {
      id: 'settings',
      route: '/settings',
      inject: baseInject,
      variants: {
        'dark-mode': { description: 'dark mode' },
      },
    },
    function Settings() { return <Text>Settings</Text>; }
  );
  expect(getScenario('settings/dark-mode')?.inject).toBe(baseInject);
});
