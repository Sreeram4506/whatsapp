export interface ReplyButton {
  id: string;
  title: string;
}
export interface ListRow {
  id: string;
  title: string;
  description?: string;
}
export interface ListSection {
  title: string;
  rows: ListRow[];
}

/** Channel-neutral outbound content produced by the bot / notification layer. */
export type OutboundContent =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: ReplyButton[]; footer?: string }
  | { kind: "list"; body: string; button: string; sections: ListSection[]; footer?: string };

/** Channel-neutral inbound input consumed by the bot engine. */
export type InboundInput =
  | { kind: "text"; text: string }
  | { kind: "reply"; id: string; title: string }
  | {
      kind: "media";
      mediaType: "image" | "document" | "audio";
      attachmentId?: string;
      fileName?: string;
      caption?: string;
      error?: string;
      transcript?: string | null;
    }
  | { kind: "location"; latitude: number; longitude: number; name?: string; address?: string }
  | { kind: "unsupported"; type: string };

export function contentToPlainText(c: OutboundContent): string {
  if (c.kind === "text") return c.body;
  if (c.kind === "buttons") return `${c.body}\n${c.buttons.map((b) => `[${b.title}]`).join(" ")}`;
  return `${c.body}\n[${c.button}] ${c.sections.flatMap((s) => s.rows.map((r) => r.title)).join(" · ")}`;
}

export function inputToPlainText(i: InboundInput): string {
  switch (i.kind) {
    case "text":
      return i.text;
    case "reply":
      return i.title;
    case "media":
      return `[${i.mediaType}${i.fileName ? `: ${i.fileName}` : ""}]${i.caption ? ` ${i.caption}` : ""}`;
    case "location":
      return `[location ${i.latitude.toFixed(5)}, ${i.longitude.toFixed(5)}]`;
    default:
      return `[unsupported: ${i.type}]`;
  }
}
