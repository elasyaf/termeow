export type MessageType = "input" | "resize" | "output" | "status" | "title" | "error";

export interface Envelope {
  type: MessageType;
  data?: string;
  cols?: number;
  rows?: number;
  message?: string;
}

export interface TerminalTab {
  id: string;
  title: string;
}
