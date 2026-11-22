package sshconfig

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// HostEntry represents a concrete host alias parsed from ~/.ssh/config.
type HostEntry struct {
	Alias        string `json:"alias"`
	HostName     string `json:"hostName"`
	User         string `json:"user"`
	Port         int    `json:"port"`
	IdentityFile string `json:"identityFile,omitempty"`
}

// ParseDefault reads ~/.ssh/config if present and returns non-wildcard host entries.
func ParseDefault() ([]HostEntry, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	path := filepath.Join(home, ".ssh", "config")
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) || os.IsPermission(err) {
			return []HostEntry{}, nil
		}
		return nil, err
	}
	defer f.Close()

	hosts := make([]HostEntry, 0)
	var current *HostEntry

	flush := func() {
		if current == nil || current.Alias == "" {
			return
		}
		if current.HostName == "" {
			current.HostName = current.Alias
		}
		if current.Port == 0 {
			current.Port = 22
		}
		hosts = append(hosts, *current)
	}

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		key := strings.ToLower(fields[0])
		val := strings.Join(fields[1:], " ")

		if key == "host" {
			flush()
			alias := fields[1]
			if strings.ContainsAny(alias, "*?!") {
				current = nil
				continue
			}
			current = &HostEntry{Alias: alias, Port: 22}
			continue
		}

		if current == nil {
			continue
		}

		switch key {
		case "hostname":
			current.HostName = val
		case "user":
			current.User = val
		case "port":
			if p, convErr := strconv.Atoi(val); convErr == nil && p > 0 && p <= 65535 {
				current.Port = p
			}
		case "identityfile":
			if strings.HasPrefix(val, "~/") {
				val = filepath.Join(home, val[2:])
			}
			current.IdentityFile = val
		}
	}

	flush()
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return hosts, nil
}
