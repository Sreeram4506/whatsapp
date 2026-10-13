import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { CitizenInput, SimMessage } from "./types";

interface MessagesResponse {
  conversation: { state: string; language: string | null } | null;
  messages: SimMessage[];
}

const sortMsgs = (a: SimMessage, b: SimMessage) => a.createdAt.localeCompare(b.createdAt);

/**
 * Talks to the server-side SIMULATOR endpoints. Every message is processed by the same
 * bot engine as the real WhatsApp webhook; replies are stored with status SIMULATED.
 */
export function useSimulator(slug: string | null, phone: string) {
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [incoming, setIncoming] = useState<SimMessage[]>([]); // proactive notifications that arrived via polling
  const known = useRef(new Set<string>());
  const busy = useRef(false);
  const base = slug ? `/api/simulator/${slug}` : null;

  const merge = useCallback((list: SimMessage[], opts: { stagger?: boolean; fromPoll?: boolean } = {}) => {
    const fresh = list.filter((m) => !known.current.has(m.id));
    if (!fresh.length) return;
    fresh.forEach((m) => known.current.add(m.id));
    const inbound = fresh.filter((m) => m.direction === "INBOUND");
    const outbound = fresh.filter((m) => m.direction === "OUTBOUND");
    setMessages((prev) => [...prev.filter((p) => !p.pending), ...inbound, ...(opts.stagger ? [] : outbound)].sort(sortMsgs));
    if (opts.fromPoll && outbound.length) setIncoming(outbound);
    if (opts.stagger && outbound.length) {
      setTyping(true);
      outbound.forEach((m, i) => {
        setTimeout(() => {
          setMessages((prev) => [...prev, m].sort(sortMsgs));
          if (i === outbound.length - 1) setTyping(false);
        }, 280 + i * 420);
      });
    }
  }, []);

  const load = useCallback(async () => {
    if (!base) return;
    known.current = new Set();
    setMessages([]);
    setLoaded(false);
    try {
      const r = await api.get<MessagesResponse>(`${base}/messages?phone=${phone}`);
      r.messages.forEach((m) => known.current.add(m.id));
      setMessages(r.messages);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, [base, phone]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll for office-initiated updates (status changes, appointment confirmations)
  useEffect(() => {
    if (!base) return;
    const id = setInterval(async () => {
      if (busy.current || document.hidden) return;
      try {
        const last = [...known.current].length ? messages.filter((m) => !m.pending).at(-1)?.createdAt : undefined;
        const after = last ? new Date(new Date(last).getTime() - 1500).toISOString() : undefined;
        const r = await api.get<MessagesResponse>(`${base}/messages?phone=${phone}${after ? `&after=${encodeURIComponent(after)}` : ""}`);
        if (!busy.current) merge(r.messages, { fromPoll: true });
      } catch {
        /* transient — next poll will retry */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [base, phone, messages, merge]);

  const send = useCallback(
    async (input: CitizenInput, preview?: { localPreviewUrl?: string }) => {
      if (!base) return;
      const temp: SimMessage = {
        id: `tmp-${Date.now()}`,
        direction: "INBOUND",
        type: input.kind,
        body: null,
        payload: { input },
        status: "PENDING",
        createdAt: new Date().toISOString(),
        pending: true,
        ...preview,
      };
      setMessages((prev) => [...prev, temp]);
      busy.current = true;
      setTyping(true);
      setError(null);
      try {
        const r = await api.post<MessagesResponse>(`${base}/messages`, { phone, input });
        if (preview?.localPreviewUrl) {
          r.messages.forEach((m) => {
            if (m.direction === "INBOUND" && m.payload.input?.kind === "media" && input.kind === "media" && m.payload.input.attachmentId === input.attachmentId) {
              m.localPreviewUrl = preview.localPreviewUrl;
            }
          });
        }
        merge(r.messages, { stagger: true });
      } catch (e) {
        setTyping(false);
        setMessages((prev) => prev.map((m) => (m.id === temp.id ? { ...m, pending: false, failed: true } : m)));
        setError((e as Error).message);
      } finally {
        busy.current = false;
      }
    },
    [base, phone, merge],
  );

  const uploadAndSend = useCallback(
    async (file: File) => {
      if (!base) return;
      const isImage = file.type.startsWith("image/");
      const form = new FormData();
      form.append("phone", phone);
      form.append("file", file);
      try {
        const r = await api.upload<{ attachmentId: string; fileName: string }>(`${base}/media`, form);
        await send(
          { kind: "media", mediaType: isImage ? "image" : "document", attachmentId: r.attachmentId, fileName: r.fileName },
          { localPreviewUrl: isImage ? URL.createObjectURL(file) : undefined },
        );
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [base, phone, send],
  );

  const sendVoice = useCallback(
    async (blob: Blob) => {
      if (!base) return;
      const temp: SimMessage = { id: `tmp-${Date.now()}`, direction: "INBOUND", type: "audio", body: null, payload: { input: { kind: "media", mediaType: "audio" } }, status: "PENDING", createdAt: new Date().toISOString(), pending: true };
      setMessages((prev) => [...prev, temp]);
      busy.current = true;
      setTyping(true);
      const form = new FormData();
      form.append("phone", phone);
      form.append("file", blob, "voice.webm");
      try {
        const r = await api.upload<MessagesResponse>(`${base}/voice`, form);
        merge(r.messages, { stagger: true });
      } catch (e) {
        setTyping(false);
        setMessages((prev) => prev.map((m) => (m.id === temp.id ? { ...m, pending: false, failed: true } : m)));
        setError((e as Error).message);
      } finally {
        busy.current = false;
      }
    },
    [base, phone, merge],
  );

  const reset = useCallback(async () => {
    if (!base) return;
    await api.post(`${base}/reset`, { phone });
    await load();
  }, [base, phone, load]);

  return { messages, typing, error, setError, loaded, send, uploadAndSend, sendVoice, reset, incoming, clearIncoming: () => setIncoming([]) };
}
