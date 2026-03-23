---
name: preflight-dev
description: Use when developing, maintaining, or extending react-native-preflight. Covers adding CLI commands, React components, babel transforms, and testing patterns.
---

# Preflight Library Development

## Before Any Change

1. Read `CLAUDE.md` for architecture and conventions
2. Run `yarn test:all` to confirm baseline is green
3. Identify which build target your change affects: `src/` (bob), `cli/` (tsc), or `babel/` (tsc)

## Change Checklist

### Adding a React Component (src/)
- [ ] Create `src/<Name>.tsx`
- [ ] Export from `src/index.tsx`
- [ ] Export types from `src/index.tsx` if applicable
- [ ] Add tests in `src/__tests__/<Name>.test.tsx`
- [ ] Mock `expo-router` and `expo-linking` in tests (PnP requires them in devDeps)
- [ ] Error handling: warn with `[preflight]` prefix, never crash
- [ ] Run `yarn test`
- [ ] Run `yarn prepare` to verify build + type generation

### Adding a CLI Command (cli/)
- [ ] Create `cli/commands/<name>.ts` with exported `run<Name>()` function
- [ ] Register in `cli/index.ts` via commander
- [ ] Import `loadConfig` if needed (check for existing import first)
- [ ] Add tests in `cli/__tests__/<name>.test.ts`
- [ ] IMPORTANT: Don't name the command file `*.test.ts` — it'll be picked up by Jest
- [ ] Run `yarn test:cli`

### Adding a Babel Transform (babel/)
- [ ] Modify `babel/strip-preflight.ts`
- [ ] Add test case in `babel/__tests__/strip-preflight.test.ts`
- [ ] Test both `strip: true` and `strip: false` paths
- [ ] Run `yarn test:babel`

### Modifying Types
- [ ] Update `src/types.ts`
- [ ] Update exports in `src/index.tsx` if new types
- [ ] Run `yarn prepare` to regenerate `.d.ts` files
- [ ] Verify `lib/typescript/src/index.d.ts` includes the new types

## Testing Patterns

### React Components
```tsx
// Always mock expo-router and expo-linking
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

// Use waitFor for async operations (not setTimeout)
await waitFor(() => {
  expect(mockRouterPush).toHaveBeenCalledWith('/route');
});

// Clear registry between tests
afterEach(() => { clearRegistry(); });
```

### CLI Commands
```ts
// Mock fs for file operations
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock existsSync selectively
mockFs.existsSync.mockImplementation((p) => String(p).includes('target-file'));
```

### Babel Plugin
```ts
// Use transformSync with the plugin directly
const result = transformSync(code, {
  plugins: [[plugin, { strip: true }]],
  parserOpts: { plugins: ['jsx'] },
});
```

## Common Pitfalls

- **Yarn PnP**: peer deps must also be in devDeps for Jest to resolve mocks
- **pixelmatch ESM**: cli/jest.config.js has special transformIgnorePatterns — don't remove
- **bob + PnP**: bob can't find tsc via PnP — types are built with direct `tsc` call
- **cli/commands/test.ts**: file name matches Jest pattern — testMatch is narrowed to `__tests__/` only
- **React import**: `react-jsx` transform — don't import React unless using `React.ComponentType` etc.
