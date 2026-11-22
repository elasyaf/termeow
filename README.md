# Termeow

A browser-tab terminal & SSH manager (like Termius, without leaving your browser), powered by a **Go** daemon and a **TypeScript + React + xterm.js** frontend.

---

## Features

- **Local Shell & SSH Tabs:** Open local PTY shells (`zsh`/`bash`) and SSH sessions side-by-side in browser tabs.
- **Auto-Discovered SSH Hosts:** Reads `~/.ssh/config` (read-only) and lists configured hosts in the sidebar.
- **Collapsible Sidebar:** Toggle the host sidebar (`◀ Hide` / `▶ Hosts`) to expand the terminal to full width.
- **Font Size Controls:** Adjust terminal font size (`10px`–`28px`) live without disconnecting active sessions.
- **Theme Presets & Custom Colors:** Choose from built-in presets (*Termeow Dark*, *Dracula*, *Nord*, *Gruvbox Dark*, *Matrix Green*, *Solarized Light*) or customize text and background colors with `localStorage` persistence.

---

## Security Model

- **Localhost-only:** Binds to `127.0.0.1:8080` by default.
- **Per-process Session Token:** Generates a 32-byte `crypto/rand` hex token in memory on startup (validated with `subtle.ConstantTimeCompare`).
- **CSWSH Protection:** WebSocket upgrades (`/ws`) enforce `Origin` hostname checks (`localhost` / `127.0.0.1` only).
- **SSH Host Verification:** Uses `~/.ssh/known_hosts` (`knownhosts.New`) and supports `SSH_AUTH_SOCK` + local private keys.

---

## Project Structure

```text
termeow/
├── README.md
├── backend/                     # Go daemon (HTTP, WebSocket, PTY, SSH)
│   ├── cmd/termeow/main.go
│   └── internal/
│       ├── session/             # Wire protocol, local PTY, SSH bridge
│       └── sshconfig/           # Read-only ~/.ssh/config parser
└── frontend/                    # Strict TypeScript + Vite + xterm.js UI
    └── src/
        ├── App.tsx
        ├── components/
        │   ├── CatLogo.tsx
        │   └── TerminalPane.tsx
        └── types/protocol.ts
```

---

## Quick Start (Local Development)

### 1. Start the Go Backend
```bash
cd backend
go run ./cmd/termeow
```
Copy the `Session token` printed in the terminal.

### 2. Start the TypeScript Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173/` in your browser and paste the session token.

---

## Cross-Platform Roadmap (macOS, Linux, Windows)

The frontend and `golang.org/x/crypto/ssh` already work across macOS, Linux, and Windows. To ship native single-binary releases for all three OSes:

1. **Windows Local PTY (`//go:build windows`):**
   - Keep `github.com/creack/pty` in `local_unix.go` (`//go:build !windows`) for macOS and Linux.
   - Add `local_windows.go` (`//go:build windows`) using **Windows ConPTY** (e.g., `github.com/UserExistsNothing/conpty`) with `pwsh.exe` / `powershell.exe` / `cmd.exe`.
2. **Windows SSH Agent:**
   - Keep `SSH_AUTH_SOCK` Unix socket dialing in `agent_unix.go` (`//go:build !windows`).
   - Add `agent_windows.go` (`//go:build windows`) to dial the Windows OpenSSH Named Pipe (`\\.\pipe\openssh-ssh-agent`).
3. **Single-Binary Packaging (`embed.FS` + GoReleaser):**
   - Embed `frontend/dist` into the Go binary using `//go:embed` so Go serves the UI directly on `http://127.0.0.1:8080`.
   - Cross-compile with GoReleaser for `darwin/arm64`, `darwin/amd64`, `linux/amd64`, `linux/arm64`, and `windows/amd64`.
