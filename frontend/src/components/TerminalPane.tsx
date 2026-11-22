import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { Envelope, TerminalTab } from "../types/protocol";

interface TerminalPaneProps {
  tab: TerminalTab;
  token: string;
  active: boolean;
  fontSize: number;
  textColor: string;
  bgColor: string;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  tab,
  token,
  active,
  fontSize,
  textColor,
  bgColor,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const initialFontSizeRef = useRef<number>(fontSize);
  const initialTextColorRef = useRef<string>(textColor);
  const initialBgColorRef = useRef<string>(bgColor);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
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
    term.loadAddon(fitAddon);
    term.open(el);
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    const params = new URLSearchParams({
      token,
      mode: tab.mode,
      cols: String(term.cols),
      rows: String(term.rows),
    });

    if (tab.mode === "ssh" && tab.host) {
      params.set("host", tab.host.hostName);
      params.set("port", String(tab.host.port));
      if (tab.host.user) params.set("user", tab.host.user);
      if (tab.host.identityFile) params.set("identityFile", tab.host.identityFile);
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws?${params.toString()}`);

    const sendEnvelope = (env: Envelope): void => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(env));
      }
    };

    ws.onmessage = (ev: MessageEvent<string>) => {
      try {
        const env = JSON.parse(ev.data) as Envelope;
        if (env.type === "output" && env.data) {
          term.write(env.data);
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

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      ws.close();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [tab, token]);

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
