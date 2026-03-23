import { transformSync } from '@babel/core';
import plugin from '../strip-preflight';

function transform(code: string, opts: { strip?: boolean } = { strip: true }) {
  const result = transformSync(code, {
    plugins: [[plugin, opts]],
    parserOpts: { plugins: ['jsx'] },
    configFile: false,
    babelrc: false,
    filename: 'test.tsx',
  });
  return result?.code ?? '';
}

test('replaces scenario(config, Component) with Component', () => {
  const input = `
    import { scenario } from 'react-native-preflight';
    export default scenario({
      id: 'test',
      route: '/test',
    }, function MyScreen() {
      return <View />;
    });
  `;
  const output = transform(input);
  expect(output).toContain('function MyScreen()');
  expect(output).not.toContain('scenario');
});

test('removes <Preflight /> JSX element', () => {
  const input = `
    import { Preflight } from 'react-native-preflight';
    function App() {
      return <Preflight />;
    }
  `;
  const output = transform(input);
  expect(output).not.toContain('Preflight');
});

test('does nothing by default when strip is not set', () => {
  const input = `
    import { scenario } from 'react-native-preflight';
    export default scenario({ id: 'test', route: '/test' }, function X() { return null; });
  `;
  const output = transform(input, {});
  expect(output).toContain('scenario');
});

test('does nothing when strip is false', () => {
  const input = `
    import { scenario } from 'react-native-preflight';
    export default scenario({ id: 'test', route: '/test' }, function X() { return null; });
  `;
  const output = transform(input, { strip: false });
  expect(output).toContain('scenario');
});

test('removes unused preflight imports after stripping', () => {
  const input = `
    import { scenario } from 'react-native-preflight';
    export default scenario({ id: 'x', route: '/x' }, function X() { return null; });
  `;
  const output = transform(input);
  expect(output).not.toContain('react-native-preflight');
});

test('replaces aliased scenario import', () => {
  const input = `
    import { scenario as s } from 'react-native-preflight';
    export default s({ id: 'test', route: '/test' }, function MyScreen() { return null; });
  `;
  const output = transform(input);
  expect(output).toContain('function MyScreen()');
  expect(output).not.toContain('scenario');
  expect(output).not.toContain('react-native-preflight');
});

test('handles namespace import for scenario', () => {
  const input = `
    import * as pf from 'react-native-preflight';
    export default pf.scenario({ id: 'test', route: '/test' }, function MyScreen() { return null; });
  `;
  const output = transform(input);
  expect(output).toContain('function MyScreen()');
  expect(output).not.toContain('scenario');
  expect(output).not.toContain('react-native-preflight');
});

test('handles namespace import for Preflight JSX', () => {
  const input = `
    import * as pf from 'react-native-preflight';
    function App() {
      return <pf.Preflight />;
    }
  `;
  const output = transform(input);
  expect(output).not.toContain('Preflight');
  expect(output).not.toContain('react-native-preflight');
});

test('keeps non-preflight scenario calls', () => {
  const input = `
    function scenario(config, component) { return component; }
    export default scenario({ id: 'test', route: '/test' }, function MyScreen() { return null; });
  `;
  const output = transform(input);
  expect(output).toContain('scenario');
  expect(output).toContain('function MyScreen()');
});

test('handles mixed imports with partial usage', () => {
  const input = `
    import { scenario, StateInjector } from 'react-native-preflight';
    export default scenario({ id: 'x', route: '/x' }, function X() { return null; });
    console.log(StateInjector);
  `;
  const output = transform(input);
  expect(output).not.toContain('scenario');
  expect(output).toContain('StateInjector');
  expect(output).toContain('react-native-preflight');
});

test('handles scenario call with less than 2 args', () => {
  const input = `
    import { scenario } from 'react-native-preflight';
    const result = scenario({ id: 'x' });
  `;
  const output = transform(input);
  // Should not crash; scenario call left as-is since < 2 args
  expect(output).toContain('scenario');
});

test('removes namespace import when fully unused after strip', () => {
  const input = `
    import * as pf from 'react-native-preflight';
    export default pf.scenario({ id: 'x', route: '/x' }, function X() { return null; });
  `;
  const output = transform(input);
  expect(output).not.toContain('react-native-preflight');
  expect(output).not.toContain('pf');
  expect(output).toContain('function X()');
});
