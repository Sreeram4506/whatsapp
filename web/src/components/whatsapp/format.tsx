import { Fragment, ReactNode } from "react";

const TOKEN = /(https?:\/\/[^\s]+|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```)/g;

/** Renders WhatsApp-style formatting: *bold*, _italic_, ~strike~, ```mono``` and links. */
export function WaText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => (
        <Fragment key={li}>
          {renderLine(line)}
          {li < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </>
  );
}

function renderLine(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  let k = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("http")) {
      out.push(
        <a key={k++} href={tok} target="_blank" rel="noreferrer noopener" className="text-[#027eb5] underline break-all">
          {tok}
        </a>,
      );
    } else if (tok.startsWith("```")) out.push(<code key={k++} className="font-mono text-[13px]">{tok.slice(3, -3)}</code>);
    else if (tok[0] === "*") out.push(<strong key={k++} className="font-semibold">{tok.slice(1, -1)}</strong>);
    else if (tok[0] === "_") out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    else out.push(<s key={k++}>{tok.slice(1, -1)}</s>);
    last = m.index + tok.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function stripWa(text: string) {
  return text.replace(/[*_~]/g, "").replace(/\s+/g, " ").trim();
}
