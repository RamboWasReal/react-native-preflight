# Navigation Flow Helpers Design

## Context

React Native Preflight already supports scenario-level tests and multi-screen flows through `ScenarioConfig.flow`. The generated Maestro YAML can start a scenario through `preflight://scenario/<id>`, run the scenario's `test` steps, assert subsequent screens through `flow`, and run each flow step's `actions`.

This covers submit-and-redirect flows when the redirect is caused by user interaction, for example typing into a form, tapping submit, and asserting that the next screen appears. The missing piece is an ergonomic way to intentionally navigate again later in the same flow without dropping to `raw()` Maestro YAML.

## Goals

- Let tests express explicit navigation inside `test` and `flow.actions`.
- Keep the current `flow.screen` meaning as an arrival assertion.
- Avoid turning `flow` into a separate DSL that duplicates the existing step helpers.
- Keep generated YAML readable and compatible with Maestro.
- Preserve `raw()` as an escape hatch for unsupported Maestro commands.

## Non-Goals

- Do not add runtime navigation APIs to `StateInjector`.
- Do not make `flow.screen` perform implicit navigation.
- Do not infer routes from screen IDs.
- Do not support dynamic route expressions in the static scanner.

## Proposed API

Add two test helpers:

```ts
navigate(route: string): TestStep
openLink(url: string): TestStep
```

`navigate(route)` is the ergonomic app-route helper. It generates a Maestro `openLink` command using the configured app scheme and a normalized route. A route may be provided with or without a leading slash.

`openLink(url)` is the lower-level helper. It generates a Maestro `openLink` command with the provided URL unchanged. This is useful for external app links, callback URLs, or cases where the route cannot be represented by the configured scheme.

Example:

```ts
scenario({
  id: 'signup',
  route: '/signup',
  test: ({ type, tap, see }) => [
    type('email-input', 'alice@test.com'),
    tap('submit-btn'),
    see({ id: 'home' }),
  ],
  flow: [
    {
      screen: 'settings',
      actions: ({ navigate, see }) => [
        navigate('/settings'),
        see({ id: 'settings' }),
      ],
    },
  ],
}, SignupScreen);
```

## YAML Generation

The generated YAML for `navigate('/settings')` should be:

```yaml
- openLink:
    link: "preflight://settings"
```

when the configured scheme is `preflight`.

The generated YAML for `openLink('myapp://settings')` should be:

```yaml
- openLink:
    link: "myapp://settings"
```

The generator must pass the configured `scheme` into both normal scenario YAML and flow YAML generation. Existing scenario launch links continue to use `preflight://scenario/<id>` until a separate compatibility decision is made.

## Static Scanning

The scanner should extract `navigate('...')` and `openLink('...')` calls from:

- `scenario.test`
- `variant.test`
- `flow[].actions`
- imported helper functions already supported by the current scanner path

Only string literals are supported. Non-literal values are ignored, consistent with existing helpers.

## Types

Extend `TestStep` and `TestHelpers` in the public React package:

```ts
| { navigate: string }
| { openLink: string }
```

and add helper functions:

```ts
navigate: (route: string) => TestStep
openLink: (url: string) => TestStep
```

The CLI has its own internal `TestStep` interface and must be kept in sync.

## Error Handling

No runtime validation is needed for `openLink(url)` beyond YAML escaping.

`navigate(route)` should normalize predictable route input:

- `settings` becomes `<scheme>://settings`
- `/settings` becomes `<scheme>://settings`
- an empty route becomes `<scheme>://`

The generator should not crash if unsupported or malformed helper usage appears in source. It should ignore calls it cannot statically understand, matching current scanner behavior.

## Testing

Add CLI tests for:

- scanning `navigate('/settings')`
- scanning `openLink('myapp://settings')`
- generating `openLink` YAML for `navigate`
- generating `openLink` YAML for `openLink`
- using navigation helpers inside `flow.actions`

Add React package tests for:

- `testHelpers.navigate`
- `testHelpers.openLink`

## Decision

`navigate(route)` uses the configured `scheme`; the current default is `preflight`. This change threads `scheme` into step YAML generation without changing existing scenario launch links, which remain `preflight://scenario/<id>` for compatibility.
