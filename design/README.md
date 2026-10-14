# Design

Placeholder for the UI and Figma work. Nothing here is implemented in the app yet.

## Figma

- File: _TODO: add link_
- Owner: _TODO: who maintains the file and exports tokens_

## What will live here

| Item | Purpose |
|---|---|
| `tokens/` | Colors, spacing, type scale and contrast pairs exported from Figma. The app theme reads from these, no hard-coded values in components |
| `screens/` | One short spec per screen: the Figma frame link, states, and accessibility notes |
| `assets/` | Exported icons or images that are not part of the Expo app bundle |

## Accessibility spec (per screen)

Every screen spec should state:

- VoiceOver / TalkBack reading order
- Accessibility label and hint for each control
- Minimum tap target (the current buttons use 56 px high)
- Behavior with large text and with high-contrast or dark appearance
- What is spoken and what is vibrated, and when

## Workflow

1. Design the screen in Figma and link the frame in `screens/<name>.md`.
2. Open a `ui/<screen-name>` branch from `main`.
3. Build against stub or fixture data so UI work never waits on ML.
4. Put the Figma frame link and a screenshot in the PR.
