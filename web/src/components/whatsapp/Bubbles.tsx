import { useState } from "react";
import { AlertCircle, Check, CheckCheck, Clock3, FileText, List, MapPin, Mic, Reply } from "lucide-react";
import { fmtTime } from "../../lib/format";
import { WaText } from "./format";
import type { BotContent, CitizenInput, ReplyButton, SimMessage } from "./types";

const BUBBLE_SHADOW = "shadow-[0_1px_0.5px_rgba(11,20,26,0.15)]";

function TailIn() {
  return (
    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute -left-2 top-0 text-white" aria-hidden>
      <path fill="currentColor" d="M5.188 1H8v11.193L1.533 3.568C.682 2.474 1.39 1 2.83 1z" opacity=".13" transform="translate(0 .5)" />
      <path fill="currentColor" d="M5.188 0H8v11.193L1.533 2.568C.682 1.474 1.39 0 2.83 0z" />
    </svg>
  );
}
function TailOut() {
  return (
    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute -right-2 top-0 text-wa-out" aria-hidden>
      <path fill="currentColor" d="M2.812 0H0v11.193l6.467-8.625C7.318 1.474 6.61 0 5.17 0z" />
    </svg>
  );
}

function Meta({ at, outgoing, status }: { at: string; outgoing?: boolean; status?: "pending" | "sent" | "read" | "failed" }) {
  return (
    <span className="float-right ml-2 mt-1.5 -mb-1 flex translate-y-0.5 items-center gap-0.5 text-[11.5px] leading-none text-wa-meta">
      {fmtTime(at)}
      {outgoing && status === "pending" && <Clock3 className="h-3 w-3" aria-label="Sending" />}
      {outgoing && status === "sent" && <Check className="h-3.5 w-3.5" aria-label="Sent" />}
      {outgoing && status === "read" && <CheckCheck className="h-3.5 w-3.5 text-wa-tick" aria-label="Read by helpdesk" />}
      {outgoing && status === "failed" && <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-label="Failed" />}
    </span>
  );
}

export function DateChip({ label }: { label: string }) {
  return (
    <div className="my-2 flex justify-center">
      <span className={`rounded-full bg-white/90 px-3 py-1 text-[12px] font-medium text-[#54656f] ${BUBBLE_SHADOW}`}>{label}</span>
    </div>
  );
}

export function TypingBubble() {
  return (
    <div className="relative ml-2 mt-1 flex">
      <div className={`relative rounded-[12px] rounded-tl-[3px] bg-white px-3.5 py-3 ${BUBBLE_SHADOW}`}>
        <TailIn />
        <div className="flex gap-1" aria-label="Helpdesk is typing">
          <span className="wa-dot h-2 w-2 rounded-full bg-[#8696a0]" />
          <span className="wa-dot h-2 w-2 rounded-full bg-[#8696a0]" />
          <span className="wa-dot h-2 w-2 rounded-full bg-[#8696a0]" />
        </div>
      </div>
    </div>
  );
}

interface BotProps {
  m: SimMessage;
  first: boolean;
  interactive: boolean;
  onButton: (b: ReplyButton) => void;
  onOpenList: (content: Extract<BotContent, { kind: "list" }>) => void;
}

export function BotBubble({ m, first, interactive, onButton, onOpenList }: BotProps) {
  const c = m.payload.content;
  if (!c) return null;
  const hasActions = c.kind === "buttons" || c.kind === "list";
  return (
    <div className={`flex flex-col items-start ${first ? "mt-2" : "mt-0.5"} pl-3 pr-10`}>
      <div className={`relative max-w-full rounded-[12px] ${first ? "rounded-tl-[3px]" : ""} bg-white px-2.5 pb-2 pt-1.5 text-[15.5px] leading-[20px] text-wa-ink ${BUBBLE_SHADOW}`}>
        {first && <TailIn />}
        <div className="whitespace-pre-wrap break-words">
          <WaText text={c.body} />
          {!(hasActions && c.footer) && <Meta at={m.createdAt} />}
        </div>
        {hasActions && c.footer && (
          <div className="mt-1 text-[12.5px] text-wa-meta">
            {c.footer}
            <Meta at={m.createdAt} />
          </div>
        )}
        {c.kind === "list" && (
          <>
            <div className="-mx-2.5 mt-2 border-t border-black/[0.08]" />
            <button
              type="button"
              disabled={!interactive}
              onClick={() => onOpenList(c)}
              className="-mb-1 flex w-full items-center justify-center gap-2 pt-2 text-[15.5px] font-medium text-[#007aff] disabled:opacity-50"
            >
              <List className="h-4 w-4" /> {c.button}
            </button>
          </>
        )}
      </div>
      {c.kind === "buttons" && (
        <div className="mt-0.5 flex w-full max-w-[290px] flex-col gap-0.5">
          {c.buttons.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={!interactive}
              onClick={() => onButton(b)}
              className={`flex items-center justify-center gap-1.5 rounded-[12px] bg-white px-3 py-2.5 text-[15.5px] font-medium text-[#007aff] transition hover:bg-[#f5f6f6] active:bg-[#e9edef] disabled:cursor-default disabled:opacity-55 disabled:hover:bg-white ${BUBBLE_SHADOW}`}
            >
              <Reply className="h-4 w-4 -scale-x-100" /> {b.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface CitizenProps {
  m: SimMessage;
  first: boolean;
  read: boolean;
  mediaUrl: (attachmentId: string) => string;
}

export function CitizenBubble({ m, first, read, mediaUrl }: CitizenProps) {
  const input = m.payload.input as CitizenInput | undefined;
  const status = m.failed ? "failed" : m.pending ? "pending" : read ? "read" : "sent";
  const [imgError, setImgError] = useState(false);
  if (!input) return null;
  const base = `relative max-w-full rounded-[12px] ${first ? "rounded-tr-[3px]" : ""} bg-wa-out text-[15.5px] leading-[20px] text-wa-ink ${BUBBLE_SHADOW}`;

  let body: React.ReactNode;
  if (input.kind === "text") {
    body = (
      <div className="whitespace-pre-wrap break-words px-2.5 pb-2 pt-1.5">
        {input.text}
        <Meta at={m.createdAt} outgoing status={status} />
      </div>
    );
  } else if (input.kind === "reply") {
    body = (
      <div className="px-2.5 pb-2 pt-1.5">
        {input.title}
        <Meta at={m.createdAt} outgoing status={status} />
      </div>
    );
  } else if (input.kind === "location") {
    body = (
      <div className="w-[230px] p-1">
        <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-md bg-[linear-gradient(135deg,#d7e8d0_0%,#e9f1e4_40%,#cfe1ea_100%)]">
          <div className="absolute inset-0 opacity-60 [background:repeating-linear-gradient(90deg,transparent_0_22px,rgba(255,255,255,.7)_22px_24px),repeating-linear-gradient(0deg,transparent_0_26px,rgba(255,255,255,.7)_26px_28px)]" />
          <MapPin className="relative h-9 w-9 fill-red-500 text-red-700" />
        </div>
        <div className="px-1.5 pb-1 pt-1.5 text-[13px]">
          <div className="font-medium">Shared location</div>
          <div className="text-[12px] text-wa-meta">
            {input.latitude.toFixed(5)}, {input.longitude.toFixed(5)}
          </div>
          <Meta at={m.createdAt} outgoing status={status} />
        </div>
      </div>
    );
  } else if (input.kind === "media" && input.mediaType === "image") {
    const src = m.localPreviewUrl ?? (input.attachmentId ? mediaUrl(input.attachmentId) : "");
    body = (
      <div className="p-1">
        {src && !imgError ? (
          <img src={src} onError={() => setImgError(true)} alt="Photo sent to helpdesk" className="max-h-60 w-[220px] rounded-md object-cover" />
        ) : (
          <div className="flex h-32 w-[220px] items-center justify-center rounded-md bg-black/5 text-xs text-wa-meta">Photo</div>
        )}
        <div className="px-1.5 pb-0.5">
          <Meta at={m.createdAt} outgoing status={status} />
          <div className="clear-both" />
        </div>
      </div>
    );
  } else if (input.kind === "media" && input.mediaType === "document") {
    body = (
      <div className="w-[240px] p-1">
        <div className="flex items-center gap-2 rounded-md bg-black/[0.05] p-2.5">
          <div className="flex h-9 w-8 items-center justify-center rounded bg-red-500 text-[9px] font-bold text-white">PDF</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px]">{input.fileName ?? "Document"}</div>
            <div className="text-[11.5px] text-wa-meta">Document</div>
          </div>
          <FileText className="h-4 w-4 text-wa-meta" />
        </div>
        <div className="px-1.5">
          <Meta at={m.createdAt} outgoing status={status} />
          <div className="clear-both" />
        </div>
      </div>
    );
  } else if (input.kind === "media" && input.mediaType === "audio") {
    body = (
      <div className="flex w-[230px] items-center gap-2 px-2.5 pb-2 pt-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-wa-green text-white">
          <Mic className="h-4 w-4" />
        </div>
        <div className="flex h-6 flex-1 items-center gap-[2px]">
          {Array.from({ length: 26 }).map((_, i) => (
            <span key={i} className="w-[3px] rounded-full bg-[#8696a0]" style={{ height: `${6 + ((i * 37) % 16)}px` }} />
          ))}
        </div>
        <Meta at={m.createdAt} outgoing status={status} />
      </div>
    );
  } else {
    body = <div className="px-2.5 py-2 text-wa-meta">Unsupported message</div>;
  }

  return (
    <div className={`flex justify-end ${first ? "mt-2" : "mt-0.5"} pl-12 pr-3`}>
      <div className={base}>
        {first && <TailOut />}
        {body}
      </div>
    </div>
  );
}
