import { injectIosPostOpenLinkHandlers } from '../inject-ios-post-open-link-handlers';

const OPEN_LINK_PROMPT_HANDLER = `platform: iOS
      visible:
        text: "Open in .*"
    commands:
      - tapOn:
          text: "Open"`;

const DEV_MENU_HANDLER = `platform: iOS
      visible:
        text: "This is the developer menu.*"
    commands:
      - tapOn:
          text: "Continue"`;

test('injects both handlers after each openLink', () => {
  const yaml = `---
- openLink:
    link: "preflight://scenario/a"

- assertVisible:
    id: "a"
`;
  const result = injectIosPostOpenLinkHandlers(yaml);
  expect(result).toContain(OPEN_LINK_PROMPT_HANDLER);
  expect(result).toContain(DEV_MENU_HANDLER);
  expect(result.indexOf(OPEN_LINK_PROMPT_HANDLER)).toBeGreaterThan(result.indexOf('preflight://scenario/a'));
  expect(result.indexOf(DEV_MENU_HANDLER)).toBeGreaterThan(result.indexOf(OPEN_LINK_PROMPT_HANDLER));
  expect(result.indexOf('- assertVisible:')).toBeGreaterThan(result.indexOf(DEV_MENU_HANDLER));
});

test('injects both handlers for every openLink', () => {
  const yaml = `---
- openLink:
    link: "preflight://scenario/a"
- openLink:
    link: "preflight://scenario/b"
`;
  const result = injectIosPostOpenLinkHandlers(yaml);
  expect(result.match(/text: "Open in \.\*"/g)).toHaveLength(2);
  expect(result.match(/text: "This is the developer menu\.\*"/g)).toHaveLength(2);
});

test('preserves nested openLink indentation', () => {
  const yaml = `- runFlow:
    commands:
      - openLink:
          link: "preflight://settings"
      - tapOn:
          id: "ok"
`;
  const result = injectIosPostOpenLinkHandlers(yaml);
  const openLinkIdx = result.indexOf('preflight://settings');
  const openPromptIdx = result.indexOf('text: "Open in .*"');
  const devMenuIdx = result.indexOf('text: "This is the developer menu.*"');
  const tapIdx = result.indexOf('id: "ok"');
  expect(openLinkIdx).toBeGreaterThan(-1);
  expect(openPromptIdx).toBeGreaterThan(openLinkIdx);
  expect(devMenuIdx).toBeGreaterThan(openPromptIdx);
  expect(tapIdx).toBeGreaterThan(devMenuIdx);
});

test('leaves yaml without openLink unchanged', () => {
  const yaml = `---
- launchApp:
    stopApp: false
- assertVisible:
    id: "home"
`;
  expect(injectIosPostOpenLinkHandlers(yaml)).toBe(yaml);
});

test('does not modify existing assertions', () => {
  const yaml = `---
- openLink:
    link: "preflight://scenario/a"
- assertVisible:
    id: "a"
- assertVisible:
    text: "Hello"
`;
  const result = injectIosPostOpenLinkHandlers(yaml);
  expect(result).toContain('- assertVisible:\n    id: "a"');
  expect(result).toContain('- assertVisible:\n    text: "Hello"');
});
