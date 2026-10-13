export interface ReplyButton {
  id: string;
  title: string;
}
export interface ListRow {
  id: string;
  title: string;
  description?: string;
}
export type BotContent =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: ReplyButton[]; footer?: string }
  | { kind: "list"; body: string; button: string; sections: { title: string; rows: ListRow[] }[]; footer?: string };

export type CitizenInput =
  | { kind: "text"; text: string }
  | { kind: "reply"; id: string; title: string }
  | { kind: "media"; mediaType: "image" | "document" | "audio"; attachmentId?: string; fileName?: string; caption?: string; transcript?: string | null; error?: string }
  | { kind: "location"; latitude: number; longitude: number; name?: string }
  | { kind: "unsupported"; type: string };

export interface SimMessage {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  body: string | null;
  payload: { content?: BotContent; input?: CitizenInput; cloudApi?: Record<string, unknown> };
  status: string;
  createdAt: string;
  grievanceId?: string | null;
  /** client-only */
  pending?: boolean;
  failed?: boolean;
  localPreviewUrl?: string;
}
