# Vunches

Electron + React IPTV desktop client (M3U/Xtream Codes, mpv playback, Chromecast). See PLAN.md for architecture/roadmap.

## Workflow

- No automated test suite exists yet (`npm test` is not defined) — `TESTING.md` is a manual checklist. Until a real test suite exists, treat "tests pass" as: `npx electron-vite build` completes without errors, plus any relevant manual check for the area touched.
- Once changes build cleanly and look correct, commit and push to `origin master` directly — don't stop to ask for confirmation first. This repo has no PR workflow; pushes go straight to master.
