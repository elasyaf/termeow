import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import type { Envelope, TerminalTab } from "../types/protocol";

interface TerminalPaneProps {
  tab: TerminalTab;
  token: string;
  active: boolean;
  fontSize: number;
  textColor: string;
  bgColor: string;
  onTitleChange: (tabId: string, title: string) => void;
}

function formatTabPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "~";
  if (trimmed === "/" || trimmed === "~") return trimmed;

  const homeNormalized = trimmed.replace(/^\/(?:Users|home)\/[^/]+/, "~");
  if (homeNormalized === "~") return "~";

  const parts = homeNormalized.split("/").filter(Boolean);
  if (parts.length <= 2) {
    return homeNormalized.startsWith("/") ? `/${parts.join("/")}` : parts.join("/");
  }
  return parts.slice(-2).join("/");
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  tab,
  token,
  active,
  fontSize,
  textColor,
  bgColor,
  onTitleChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const initialFontSizeRef = useRef<number>(fontSize);
  const initialTextColorRef = useRef<string>(textColor);
  const initialBgColorRef = useRef<string>(bgColor);
  const onTitleChangeRef = useRef(onTitleChange);
  const tabRef = useRef(tab);

  useEffect(() => {
    onTitleChangeRef.current = onTitleChange;
  }, [onTitleChange]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: initialFontSizeRef.current,
      theme: {
        background: initialBgColorRef.current,
        foreground: initialTextColorRef.current,
        cursor: "#38BDF8",
        selectionBackground: "#334155",
      },
    });

    const fitAddon = new FitAddon();
    termRef.current = term;
    fitRef.current = fitAddon;
    const fitSafely = (): void => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        fitAddon.fit();
      }
    };

    term.loadAddon(fitAddon);
    const unicode11Addon = new Unicode11Addon();
    term.loadAddon(unicode11Addon);
    term.unicode.activeVersion = "11";
    term.open(el);
    fitSafely();
    const rafId = requestAnimationFrame(fitSafely);

    const currentTab = tabRef.current;
    const params = new URLSearchParams({
      token,
      cols: String(term.cols),
      rows: String(term.rows),
    });

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws?${params.toString()}`);

    const sendEnvelope = (env: Envelope): void => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(env));
      }
    };

    ws.onopen = () => {
      fitSafely();
      sendEnvelope({ type: "resize", cols: term.cols, rows: term.rows });
    };

    ws.onmessage = (ev: MessageEvent<string>) => {
      try {
        const env = JSON.parse(ev.data) as Envelope;
        if (env.type === "output" && env.data) {
          term.write(env.data);
        } else if (env.type === "title" && env.data) {
          onTitleChangeRef.current(currentTab.id, formatTabPath(env.data));
        } else if (env.type === "error" && env.message) {
          term.writeln(`\r\n\x1b[31m[termeow error] ${env.message}\x1b[0m`);
        }
      } catch {
        term.write(ev.data);
      }
    };

    ws.onclose = () => {
      term.writeln("\r\n\x1b[33m[session closed]\x1b[0m");
    };

    const dataDisposable = term.onData((data) => {
      sendEnvelope({ type: "input", data });
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      sendEnvelope({ type: "resize", cols, rows });
    });

    const titleDisposable = term.onTitleChange((title) => {
      const trimmed = title.trim();
      if (trimmed) {
        onTitleChangeRef.current(currentTab.id, formatTabPath(trimmed));
      }
    });

    const osc7Disposable = term.parser.registerOscHandler(7, (data) => {
      try {
        const parsed = new URL(data);
        const path = decodeURIComponent(parsed.pathname);
        if (path) {
          onTitleChangeRef.current(currentTab.id, formatTabPath(path));
        }
      } catch {
        // Ignore malformed OSC 7 payloads.
      }
      return false;
    });

    const observer = new ResizeObserver(() => {
      fitSafely();
    });
    observer.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      titleDisposable.dispose();
      osc7Disposable.dispose();
      ws.close();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [tab.id, token]);

  useEffect(() => {
    if (active && fitRef.current) {
      fitRef.current.fit();
    }
  }, [active]);

  useEffect(() => {
    const term = termRef.current;
    const fitAddon = fitRef.current;
    if (!term || !fitAddon) return;
    term.options.fontSize = fontSize;
    fitAddon.fit();
  }, [fontSize]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = {
      ...term.options.theme,
      background: bgColor,
      foreground: textColor,
    };
  }, [textColor, bgColor]);

  return (
    <div
      ref={containerRef}
      className="terminal-pane"
      style={{ display: active ? "block" : "none" }}
    />
  );
};
