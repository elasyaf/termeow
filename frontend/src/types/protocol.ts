export type MessageType = "input" | "resize" | "output" | "status" | "error";

export interface Envelope {
  type: MessageType;
  data?: string;
  cols?: number;
  rows?: number;
  message?: string;
}

export interface SSHHostEntry {
  alias: string;
  hostName: string;
  user: string;
  port: number;
  identityFile?: string;
}

export type SessionMode = "local" | "ssh";

export interface TerminalTab {
  id: string;
  title: string;
  mode: SessionMode;
  host?: SSHHostEntry;
}
