import { useState } from "react";
import { Camera, FileText, Image as ImageIcon, MapPin } from "lucide-react";
import type { BotContent, ListRow } from "./types";

/** iOS-style bottom sheet with a grab handle. */
export function ListSheet({
  content,
  onClose,
  onSelect,
}: {
  content: Extract<BotContent, { kind: "list" }>;
  onClose: () => void;
  onSelect: (row: ListRow) => void;
}) {
  const [selected, setSelected] = useState<ListRow | null>(null);
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/40" onClick={onClose} role="dialog" aria-modal aria-label={content.button}>
      <div className="animate-sheet-up flex max-h-[80%] flex-col rounded-t-[14px] bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-2">
          <span className="h-[5px] w-9 rounded-full bg-[#c7c7cc]" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-4 pb-2 pt-2">
          <button type="button" onClick={onClose} className="min-w-[60px] text-left text-[16px] text-[#007aff]">
            Cancel
          </button>
          <div className="text-[16px] font-semibold text-black">{content.button}</div>
          <span className="min-w-[60px]" />
        </div>
        <div className="scrollbar-thin min-h-0 shrink overflow-y-auto border-t border-black/[0.08] pb-2">
          {content.sections.map((s) => (
            <div key={s.title}>
              <div className="px-5 pb-1 pt-3 text-[12.5px] font-medium uppercase tracking-wide text-[#8e8e93]">{s.title}</div>
              {s.rows.map((r) => (
                <label key={r.id} className="relative flex cursor-pointer items-center gap-3 border-b border-black/[0.06] px-5 py-3 active:bg-[#f2f2f7]">
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] text-black">{r.title}</div>
                    {r.description && <div className="text-[13px] leading-snug text-[#8e8e93]">{r.description}</div>}
                  </div>
                  <input type="radio" name="wa-list" className="peer sr-only" checked={selected?.id === r.id} onChange={() => setSelected(r)} />
                  <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-[#c7c7cc] peer-checked:border-[#25d366] peer-focus-visible:ring-2 peer-focus-visible:ring-[#25d366]/40">
                    <span className={`h-3 w-3 rounded-full ${selected?.id === r.id ? "bg-[#25d366]" : ""}`} />
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="px-4 pb-[30px] pt-3">
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onSelect(selected)}
            className="h-[48px] w-full rounded-full bg-[#25d366] text-[16px] font-semibold text-white transition disabled:bg-[#e5e5ea] disabled:text-[#aeaeb2]"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/** iOS action sheet for attachments. */
export function AttachSheet({
  onClose,
  onDocument,
  onGallery,
  onCamera,
  onLocation,
}: {
  onClose: () => void;
  onDocument: () => void;
  onGallery: () => void;
  onCamera: () => void;
  onLocation: () => void;
}) {
  const items = [
    { label: "Photo Library", icon: ImageIcon, onClick: onGallery },
    { label: "Camera", icon: Camera, onClick: onCamera },
    { label: "Location", icon: MapPin, onClick: onLocation },
    { label: "Document (PDF)", icon: FileText, onClick: onDocument },
  ];
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/35 px-2 pb-[26px]" onClick={onClose}>
      <div className="animate-sheet-up space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="overflow-hidden rounded-[14px] bg-white/95 backdrop-blur">
          <p className="border-b border-black/[0.08] px-4 py-2.5 text-center text-[12.5px] leading-snug text-[#8e8e93]">
            Photos / PDF up to 5 MB. Location uses your browser's real position, only if you allow it.
          </p>
          {items.map((it) => (
            <button key={it.label} type="button" onClick={it.onClick} className="flex w-full items-center justify-between border-b border-black/[0.08] px-5 py-3.5 text-[18px] text-[#007aff] last:border-b-0 active:bg-black/5">
              {it.label}
              <it.icon className="h-5 w-5" />
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="w-full rounded-[14px] bg-white py-3.5 text-[18px] font-semibold text-[#007aff] active:bg-[#f2f2f7]">
          Cancel
        </button>
      </div>
    </div>
  );
}

const EMOJIS = ["🙏", "👍", "😊", "🙂", "😟", "😡", "⚠️", "💧", "💡", "🛣️", "🚧", "🏥", "🏫", "📍", "✅", "❤️"];

export function EmojiTray({ onPick }: { onPick: (e: string) => void }) {
  return (
    <div className="absolute bottom-[86px] left-2 right-2 z-30 grid grid-cols-8 gap-1 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-black/5">
      {EMOJIS.map((e) => (
        <button key={e} type="button" onClick={() => onPick(e)} className="rounded-lg p-1 text-[22px] active:bg-black/5" aria-label={`Insert ${e}`}>
          {e}
        </button>
      ))}
    </div>
  );
}
