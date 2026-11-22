package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"termeow/internal/session"
	"termeow/internal/sshconfig"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "listen address (localhost recommended)")
	tokenFlag := flag.String("token", "", "optional static session token for local dev")
	flag.Parse()

	token := *tokenFlag
	if token == "" {
		var err error
		token, err = generateToken(32)
		if err != nil {
			log.Fatalf("generate token: %v", err)
		}
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  8192,
		WriteBufferSize: 8192,
		CheckOrigin:     isLocalOrigin,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("GET /api/hosts", requireToken(token, func(w http.ResponseWriter, r *http.Request) {
		hosts, err := sshconfig.ParseDefault()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"hosts": hosts})
	}))

	mux.HandleFunc("GET /ws", requireToken(token, func(w http.ResponseWriter, r *http.Request) {
		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer ws.Close()

		q := r.URL.Query()
		mode := q.Get("mode")
		cols := parseUint16(q.Get("cols"), 80)
		rows := parseUint16(q.Get("rows"), 24)

		var runErr error
		if mode == "ssh" {
			target := session.SSHTarget{
				Host:         q.Get("host"),
				Port:         int(parseUint16(q.Get("port"), 22)),
				User:         q.Get("user"),
				IdentityFile: q.Get("identityFile"),
			}
			if target.Host == "" {
				sendWSError(ws, "missing host parameter")
				return
			}
			runErr = session.RunSSH(r.Context(), ws, target, cols, rows)
		} else {
			runErr = session.RunLocalPTY(r.Context(), ws, cols, rows)
		}

		if runErr != nil && !errors.Is(runErr, context.Canceled) {
			sendWSError(ws, runErr.Error())
		}
	}))

	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("Termeow daemon listening on http://%s", *addr)
		log.Printf("Session token: %s", token)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}

func isLocalOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := u.Hostname()
	return host == "localhost" || host == "127.0.0.1"
}

func requireToken(expected string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		provided := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if provided == "" {
			provided = r.URL.Query().Get("token")
		}
		if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

func sendWSError(ws *websocket.Conn, msg string) {
	if payload, err := session.MarshalEnvelope(session.Envelope{
		Type:    session.TypeError,
		Message: msg,
	}); err == nil {
		_ = ws.WriteMessage(websocket.TextMessage, payload)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func generateToken(numBytes int) (string, error) {
	b := make([]byte, numBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func parseUint16(raw string, fallback uint16) uint16 {
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseUint(raw, 10, 16)
	if err != nil || v == 0 {
		return fallback
	}
	return uint16(v)
}
