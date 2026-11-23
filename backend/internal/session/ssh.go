package session

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"
)

// SSHTarget describes an SSH destination to connect to.
type SSHTarget struct {
	Host         string
	Port         int
	User         string
	IdentityFile string
}

// RunSSH opens an interactive SSH PTY session with known_hosts verification and bridges it to ws.
func RunSSH(ctx context.Context, ws *websocket.Conn, target SSHTarget, cols, rows uint16) error {
	if target.Port == 0 {
		target.Port = 22
	}
	if target.User == "" {
		target.User = os.Getenv("USER")
	}

	hostKeyCallback, err := defaultKnownHostsCallback()
	if err != nil {
		return fmt.Errorf("known_hosts setup failed: %w", err)
	}

	authMethods := collectAuthMethods(target.IdentityFile)
	if len(authMethods) == 0 {
		return fmt.Errorf("no SSH auth methods available (no agent socket or readable private key)")
	}

	cfg := &ssh.ClientConfig{
		User:            target.User,
		Auth:            authMethods,
		HostKeyCallback: hostKeyCallback,
		Timeout:         10 * time.Second,
	}

	addr := net.JoinHostPort(target.Host, strconv.Itoa(target.Port))
	client, err := ssh.Dial("tcp", addr, cfg)
	if err != nil {
		return fmt.Errorf("ssh dial %s: %w", addr, err)
	}
	defer client.Close()

	sess, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("ssh new session: %w", err)
	}
	defer sess.Close()

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	c := int(maxUint16(cols, 80))
	r := int(maxUint16(rows, 24))
	if err := sess.RequestPty("xterm-256color", r, c, modes); err != nil {
		return fmt.Errorf("request pty: %w", err)
	}

	stdin, err := sess.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := sess.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := sess.StderrPipe()
	if err != nil {
		return err
	}

	if err := sess.Shell(); err != nil {
		return fmt.Errorf("start shell: %w", err)
	}

	combined := &sshStream{
		r: io.MultiReader(stdout, stderr),
		w: stdin,
	}

	return bridgeReadWriter(ctx, ws, combined, target.Host, func(cols, rows uint16) error {
		return sess.WindowChange(int(rows), int(cols))
	})
}

type sshStream struct {
	r io.Reader
	w io.Writer
}

func (s *sshStream) Read(p []byte) (int, error)  { return s.r.Read(p) }
func (s *sshStream) Write(p []byte) (int, error) { return s.w.Write(p) }

func defaultKnownHostsCallback() (ssh.HostKeyCallback, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	khPath := filepath.Join(home, ".ssh", "known_hosts")
	if _, err := os.Stat(khPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("%s does not exist; connect once via ssh CLI to trust host keys", khPath)
	}
	return knownhosts.New(khPath)
}

func collectAuthMethods(explicitKey string) []ssh.AuthMethod {
	var methods []ssh.AuthMethod

	if sock := os.Getenv("SSH_AUTH_SOCK"); sock != "" {
		if conn, err := net.Dial("unix", sock); err == nil {
			methods = append(methods, ssh.PublicKeysCallback(agent.NewClient(conn).Signers))
		}
	}

	var candidates []string
	if explicitKey != "" {
		candidates = append(candidates, explicitKey)
	}
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates,
			filepath.Join(home, ".ssh", "id_ed25519"),
			filepath.Join(home, ".ssh", "id_rsa"),
		)
	}

	for _, path := range candidates {
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		signer, err := ssh.ParsePrivateKey(raw)
		if err != nil {
			continue
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}

	return methods
}
