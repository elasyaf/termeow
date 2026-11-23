# Changelog

All notable changes to **Termeow** are documented in this file.

## [Unreleased]

### Added
- Dynamic compact working-directory tab titles (`~`, `termeow/backend`) via initial PTY `title` envelope, `onTitleChange`, and `OSC 7` directory tracking.
- UTF-8 locale enforcement (`LANG`/`LC_CTYPE`) and rune-boundary buffering in `local.go`, plus `@xterm/addon-unicode11` for interactive CLIs (`claude`, `nano`, etc.).
- Initial PTY dimension sync before WebSocket connect and on `ws.onopen` so full-screen TUIs render across the full viewport immediately.
- `CHANGELOG.md` and updated `README.md` for local-only terminal mode.

### Changed
- Local terminal sessions now start in `~` (`os.UserHomeDir()`) by default.
- Moved terminal appearance controls (theme presets, text/background color pickers, `Reset`, and font size `A-`/`A+`) into the sidebar.
- Placed the `◀` hide-sidebar toggle in the sidebar header and `▶ Menu` restore button in the top tab bar when collapsed.

### Removed
- Remote SSH session support (`ssh.go`, `sshconfig/parser.go`, `/api/hosts`, and SSH sidebar host list) to focus on local browser terminal sessions.

## [0.1.0] - 2026-11-22

### Added
- Initial **Termeow** MVP with Go backend (`127.0.0.1:8080`, `crypto/rand` session token, strict localhost WebSocket `Origin` checks, local PTY bridge) and TypeScript + React + `xterm.js` multi-tab frontend with cat logo.
