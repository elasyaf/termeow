import React, { useCallback, useState } from "react";
import { CatLogo } from "./components/CatLogo";
import { TerminalPane } from "./components/TerminalPane";
import type { SSHHostEntry, TerminalTab } from "./types/protocol";

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 28;
const DEFAULT_FONT_SIZE = 14;
const FONT_SIZE_STORAGE_KEY = "termeow.fontSize";
const SIDEBAR_STORAGE_KEY = "termeow.sidebarOpen";
const TEXT_COLOR_STORAGE_KEY = "termeow.textColor";
const BG_COLOR_STORAGE_KEY = "termeow.bgColor";
const DEFAULT_TEXT_COLOR = "#E2E8F0";
const DEFAULT_BG_COLOR = "#0B1120";

interface ThemePreset {
  id: string;
  label: string;
  textColor: string;
  bgColor: string;
}

const THEME_PRESETS: readonly ThemePreset[] = [
  { id: "termeow", label: "Termeow Dark", textColor: DEFAULT_TEXT_COLOR, bgColor: DEFAULT_BG_COLOR },
  { id: "dracula", label: "Dracula", textColor: "#F8F8F2", bgColor: "#282A36" },
  { id: "nord", label: "Nord", textColor: "#D8DEE9", bgColor: "#2E3440" },
  { id: "gruvbox", label: "Gruvbox Dark", textColor: "#EBDBB2", bgColor: "#282828" },
  { id: "matrix", label: "Matrix Green", textColor: "#4ADE80", bgColor: "#071108" },
  { id: "solarized-light", label: "Solarized Light", textColor: "#586E75", bgColor: "#FDF6E3" },
];

function loadSavedHexColor(key: string, fallback: string): string {
  const raw = window.localStorage.getItem(key);
  return raw && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
}

function loadSavedSidebarOpen(): boolean {
  const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
  return raw === null ? true : raw === "true";
}

function loadSavedFontSize(): number {
  const raw = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= MIN_FONT_SIZE && parsed <= MAX_FONT_SIZE) {
    return parsed;
  }
  return DEFAULT_FONT_SIZE;
}

export const App: React.FC = () => {
  const [token, setToken] = useState<string>("");
  const [connected, setConnected] = useState<boolean>(false);
  const [hosts, setHosts] = useState<SSHHostEntry[]>([]);
  const [authError, setAuthError] = useState<string>("");
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<number>(loadSavedFontSize);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(loadSavedSidebarOpen);
  const [textColor, setTextColor] = useState<string>(() =>
    loadSavedHexColor(TEXT_COLOR_STORAGE_KEY, DEFAULT_TEXT_COLOR),
  );
  const [bgColor, setBgColor] = useState<string>(() =>
    loadSavedHexColor(BG_COLOR_STORAGE_KEY, DEFAULT_BG_COLOR),
  );

  const updateTextColor = (color: string): void => {
    setTextColor(color);
    window.localStorage.setItem(TEXT_COLOR_STORAGE_KEY, color);
  };

  const updateBgColor = (color: string): void => {
    setBgColor(color);
    window.localStorage.setItem(BG_COLOR_STORAGE_KEY, color);
  };

  const resetColors = (): void => {
    updateTextColor(DEFAULT_TEXT_COLOR);
    updateBgColor(DEFAULT_BG_COLOR);
  };

  const applyPreset = (presetId: string): void => {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    updateTextColor(preset.textColor);
    updateBgColor(preset.bgColor);
  };

  const activePresetId =
    THEME_PRESETS.find(
      (p) =>
        p.textColor.toLowerCase() === textColor.toLowerCase() &&
        p.bgColor.toLowerCase() === bgColor.toLowerCase(),
    )?.id ?? "custom";

  const toggleSidebar = (): void => {
    setSidebarOpen((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  const updateFontSize = (delta: number): void => {
    setFontSize((prev) => {
      const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, prev + delta));
      window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next));
      return next;
    });
  };

  const loadHosts = async (sessionToken: string): Promise<void> => {
    setAuthError("");
    try {
      const res = await fetch("/api/hosts", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        setAuthError(errBody.error ? `Error (${res.status}): ${errBody.error}` : `Connection failed (${res.status}).`);
        return;
      }
      const data = (await res.json()) as { hosts: SSHHostEntry[] };
      setHosts(data.hosts);
      setConnected(true);

      if (tabs.length === 0) {
        openLocalTab();
      }
    } catch {
      setAuthError("Cannot reach Termeow daemon on /api/hosts.");
    }
  };

  const openLocalTab = (): void => {
    const id = `local-${Date.now()}`;
    const newTab: TerminalTab = { id, title: "~", mode: "local" };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
  };

  const updateTabTitle = useCallback((id: string, title: string): void => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  const openSSHTab = (host: SSHHostEntry): void => {
    const id = `ssh-${host.alias}-${Date.now()}`;
    const newTab: TerminalTab = {
      id,
      title: host.alias,
      mode: "ssh",
      host,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
  };

  const closeTab = (id: string): void => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        const last = next[next.length - 1];
        setActiveTabId(last ? last.id : null);
      }
      return next;
    });
  };

  if (!connected) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="brand-row">
            <CatLogo size={40} />
            <h1>Termeow</h1>
          </div>
          <p className="subtitle">
            Browser-native terminal &amp; SSH manager. Paste the session token printed by the Go daemon.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadHosts(token.trim());
            }}
          >
            <input
              type="password"
              placeholder="Session token..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoFocus
            />
            <button type="submit" disabled={!token.trim()}>
              Connect
            </button>
          </form>
          {authError && <p className="error-text">{authError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="workspace">
      {sidebarOpen && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="brand-row">
              <CatLogo size={26} />
              <span className="brand-name">Termeow</span>
            </div>
            <button
              className="sidebar-toggle-btn"
              onClick={toggleSidebar}
              aria-label="Hide sidebar"
              title="Hide sidebar"
            >
              ◀
            </button>
          </div>

          <button className="new-local-btn" onClick={openLocalTab}>
            + Local Shell
          </button>

          <div className="section-label">~/.ssh/config ({hosts.length})</div>
          <div className="host-list">
            {hosts.length === 0 ? (
              <div className="empty-hosts">No hosts found in ~/.ssh/config</div>
            ) : (
              hosts.map((h) => (
                <button
                  key={h.alias}
                  className="host-item"
                  onClick={() => openSSHTab(h)}
                  title={`${h.user || "default"}@${h.hostName}:${h.port}`}
                >
                  <span className="host-alias">{h.alias}</span>
                  <span className="host-meta">{h.hostName}</span>
                </button>
              ))
            )}
          </div>

          <div className="sidebar-appearance">
            <div className="section-label">Appearance</div>
            <div className="color-controls" aria-label="Terminal color controls">
              <select
                className="theme-select"
                value={activePresetId}
                onChange={(e) => applyPreset(e.target.value)}
                aria-label="Theme preset"
                title="Terminal theme preset"
              >
                {THEME_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
                {activePresetId === "custom" && <option value="custom">Custom</option>}
              </select>
              <div className="color-pickers-row">
                <label className="color-picker-label" title="Text color">
                  <span>Text</span>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => updateTextColor(e.target.value)}
                    aria-label="Text color"
                  />
                </label>
                <label className="color-picker-label" title="Background color">
                  <span>BG</span>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => updateBgColor(e.target.value)}
                    aria-label="Background color"
                  />
                </label>
                {(textColor !== DEFAULT_TEXT_COLOR || bgColor !== DEFAULT_BG_COLOR) && (
                  <button
                    className="font-btn"
                    onClick={resetColors}
                    title="Reset colors to default"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="font-controls" aria-label="Terminal font size controls">
              <span className="control-label">Font</span>
              <div className="font-buttons">
                <button
                  className="font-btn"
                  onClick={() => updateFontSize(-1)}
                  disabled={fontSize <= MIN_FONT_SIZE}
                  title="Decrease font size"
                >
                  A-
                </button>
                <span className="font-size-label">{fontSize}px</span>
                <button
                  className="font-btn"
                  onClick={() => updateFontSize(1)}
                  disabled={fontSize >= MAX_FONT_SIZE}
                  title="Increase font size"
                >
                  A+
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}

      <main className="main-area">
        <header className="tab-bar">
          <div className="tab-bar-left">
            {!sidebarOpen && (
              <button
                className="sidebar-toggle-btn"
                onClick={toggleSidebar}
                aria-label="Show sidebar"
                title="Show sidebar"
              >
                ▶ Menu
              </button>
            )}

            <div className="tab-list">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`tab ${tab.id === activeTabId ? "active" : ""}`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span>{tab.title}</span>
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  aria-label={`Close ${tab.title}`}
                >
                  ×
                </button>
              </div>
            ))}
            </div>
          </div>
        </header>

        <div className="terminal-stage" style={{ backgroundColor: bgColor }}>
          {tabs.length === 0 ? (
            <div className="empty-stage">Open a Local Shell or pick an SSH host from the sidebar.</div>
          ) : (
            tabs.map((tab) => (
              <TerminalPane
                key={tab.id}
                tab={tab}
                token={token}
                active={tab.id === activeTabId}
                fontSize={fontSize}
                textColor={textColor}
                bgColor={bgColor}
                onTitleChange={updateTabTitle}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
};
