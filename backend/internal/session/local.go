package session

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

// RunLocalPTY spawns the user's default shell in a PTY and bridges it to ws until ctx is cancelled.
func RunLocalPTY(ctx context.Context, ws *websocket.Conn, cols, rows uint16) error {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}

	cmd := exec.CommandContext(ctx, shell, "-l")
	cmd.Env = withUTF8Locale(append(os.Environ(), "TERM=xterm-256color"))
	initialTitle := ""
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		cmd.Dir = home
		initialTitle = "~"
	} else {
		initialTitle = currentShortWd()
	}

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
		Cols: maxUint16(cols, 80),
		Rows: maxUint16(rows, 24),
	})
	if err != nil {
		return err
	}
	defer func() {
		_ = ptmx.Close()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	}()

	return bridgeReadWriter(ctx, ws, ptmx, initialTitle, func(c, r uint16) error {
		return pty.Setsize(ptmx, &pty.Winsize{Cols: c, Rows: r})
	})
}

func bridgeReadWriter(
	ctx context.Context,
	ws *websocket.Conn,
	rw io.ReadWriter,
	initialTitle string,
	resize func(cols, rows uint16) error,
) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var wsWriteMu sync.Mutex
	send := func(env Envelope) error {
		payload, err := MarshalEnvelope(env)
		if err != nil {
			return err
		}
		wsWriteMu.Lock()
		defer wsWriteMu.Unlock()
		return ws.WriteMessage(websocket.TextMessage, payload)
	}

	_ = send(Envelope{Type: TypeStatus, Message: "connected"})
	if initialTitle != "" {
		_ = send(Envelope{Type: TypeTitle, Data: initialTitle})
	}

	errCh := make(chan error, 2)

	// PTY/SSH -> WebSocket (buffer incomplete trailing UTF-8 runes across reads)
	go func() {
		buf := make([]byte, 8192)
		var pending []byte
		for {
			n, err := rw.Read(buf)
			if n > 0 {
				chunk := append(pending, buf[:n]...)
				validLen := completeUTF8PrefixLen(chunk)
				if validLen > 0 {
					if writeErr := send(Envelope{Type: TypeOutput, Data: string(chunk[:validLen])}); writeErr != nil {
						errCh <- writeErr
						return
					}
				}
				pending = append([]byte(nil), chunk[validLen:]...)
			}
			if err != nil {
				if len(pending) > 0 {
					_ = send(Envelope{Type: TypeOutput, Data: string(pending)})
				}
				errCh <- err
				return
			}
		}
	}()

	// WebSocket -> PTY/SSH
	go func() {
		for {
			_, msg, err := ws.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}

			var env Envelope
			if err := json.Unmarshal(msg, &env); err != nil {
				continue
			}

			switch env.Type {
			case TypeInput:
				if env.Data != "" {
					if _, err := io.WriteString(rw, env.Data); err != nil {
						errCh <- err
						return
					}
				}
			case TypeResize:
				if env.Cols > 0 && env.Rows > 0 {
					_ = resize(env.Cols, env.Rows)
				}
			}
		}
	}()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case err := <-errCh:
		return err
	}
}

func maxUint16(v, fallback uint16) uint16 {
	if v == 0 {
		return fallback
	}
	return v
}

func currentShortWd() string {
	wd, err := os.Getwd()
	if err != nil {
		return ""
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" && strings.HasPrefix(wd, home) {
		rel := strings.TrimPrefix(wd, home)
		if rel == "" {
			return "~"
		}
		return "~" + rel
	}
	return wd
}

func withUTF8Locale(env []string) []string {
	hasLang := false
	hasLC := false
	for _, entry := range env {
		if strings.HasPrefix(entry, "LANG=") && strings.Contains(strings.ToUpper(entry), "UTF-8") {
			hasLang = true
		}
		if strings.HasPrefix(entry, "LC_CTYPE=") && strings.Contains(strings.ToUpper(entry), "UTF-8") {
			hasLC = true
		}
	}
	if !hasLang {
		env = append(env, "LANG=en_US.UTF-8")
	}
	if !hasLC {
		env = append(env, "LC_CTYPE=en_US.UTF-8")
	}
	return env
}

func completeUTF8PrefixLen(b []byte) int {
	n := len(b)
	for i := 1; i <= 3 && i <= n; i++ {
		start := n - i
		if utf8.RuneStart(b[start]) {
			if utf8.FullRune(b[start:]) {
				return n
			}
			return start
		}
	}
	return n
}
