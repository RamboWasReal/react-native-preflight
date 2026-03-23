import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Preflight } from '../Preflight';
import { registerScenario, clearRegistry } from '../registry';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));

afterEach(() => {
  clearRegistry();
  jest.clearAllMocks();
});

test('renders empty state when no scenarios', () => {
  const { getByText } = render(<Preflight />);
  expect(getByText('No scenarios registered')).toBeTruthy();
});

test('lists all registered scenarios', () => {
  registerScenario({ id: 'screen-a', route: '/a', description: 'Screen A' });
  registerScenario({ id: 'screen-b', route: '/b', description: 'Screen B' });

  const { getByText } = render(<Preflight />);
  expect(getByText('screen-a')).toBeTruthy();
  expect(getByText('Screen A')).toBeTruthy();
  expect(getByText('screen-b')).toBeTruthy();
});

test('Preview calls inject then navigates', async () => {
  const inject = jest.fn();
  registerScenario({ id: 'nav-test', route: '/nav-test', inject });

  const { getAllByText } = render(<Preflight />);
  fireEvent.press(getAllByText('Preview')[0]!);

  await waitFor(() => {
    expect(inject).toHaveBeenCalledWith(undefined);
    expect(mockRouterPush).toHaveBeenCalledWith('/nav-test');
  });
});

test('uses onNavigate override when provided', async () => {
  const onNavigate = jest.fn();
  registerScenario({ id: 'custom-nav', route: '/custom-nav' });

  const { getAllByText } = render(<Preflight onNavigate={onNavigate} />);
  fireEvent.press(getAllByText('Preview')[0]!);

  await waitFor(() => {
    expect(onNavigate).toHaveBeenCalledWith('custom-nav');
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

test('does not navigate when inject rejects', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation();
  const inject = jest.fn().mockRejectedValueOnce(new Error('state error'));
  registerScenario({ id: 'fail-nav', route: '/fail-nav', inject });

  const { getAllByText } = render(<Preflight />);
  fireEvent.press(getAllByText('Preview')[0]!);

  await waitFor(() => {
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('inject() failed'),
      expect.any(Error),
    );
  });
  expect(mockRouterPush).not.toHaveBeenCalled();
  error.mockRestore();
});
