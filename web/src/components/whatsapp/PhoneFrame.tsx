import { ReactNode, useEffect, useState } from "react";

function useClock() {
  const fmt = () => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date());
  const [t, setT] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setT(fmt()), 10_000);
    return () => clearInterval(id);
  }, []);
  return t;
}

/** iOS status bar: time in the left "ear", cellular / Wi-Fi / battery in the right. Sits over the screen content. */
export function StatusBar() {
  const time = useClock();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex h-[54px] items-start justify-between px-[30px] pt-[19px] text-black" aria-hidden>
      <span className="w-[84px] text-center text-[17px] font-semibold tracking-tight">{time}</span>
      <span className="flex items-center gap-[6px] pr-1">
        {/* cellular */}
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        {/* wifi */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M1.2 4.2a10 10 0 0 1 14.6 0" />
          <path d="M3.8 7a6.2 6.2 0 0 1 9.4 0" />
          <circle cx="8.5" cy="10.2" r="1.1" fill="currentColor" stroke="none" />
        </svg>
        {/* battery */}
        <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
          <rect x="0.5" y="0.5" width="22.5" height="12" rx="3.8" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="19.5" height="9" rx="2.5" fill="currentColor" />
          <path d="M24.5 4.3v4.4c.9-.3 1.6-1.2 1.6-2.2s-.7-1.9-1.6-2.2z" fill="currentColor" opacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

// Design size of an iPhone 15 Pro screen in CSS px; the whole device is scaled to fit the window.
const SCREEN_W = 393;
const SCREEN_H = 852;
const BEZEL = 11;
const RING = 3;
const DEVICE_W = SCREEN_W + 2 * (BEZEL + RING);
const DEVICE_H = SCREEN_H + 2 * (BEZEL + RING);

function useFitScale() {
  const calc = () => Math.min(1, Math.max(0.72, (window.innerHeight - 150) / DEVICE_H));
  const [s, setS] = useState(calc);
  useEffect(() => {
    const f = () => setS(calc());
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return s;
}

/** An iPhone-style device (titanium frame, Dynamic Island, side buttons, home indicator). Desktop only. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const scale = useFitScale();
  return (
    <div className="mx-auto" style={{ width: DEVICE_W * scale, height: DEVICE_H * scale }}>
      <div className="relative" style={{ width: DEVICE_W, height: DEVICE_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {/* side buttons: action, volume up/down (left), power (right) */}
        <span className="absolute -left-[3px] top-[118px] h-[30px] w-[4px] rounded-l-sm bg-[#3a3a3f]" aria-hidden />
        <span className="absolute -left-[3px] top-[178px] h-[58px] w-[4px] rounded-l-sm bg-[#3a3a3f]" aria-hidden />
        <span className="absolute -left-[3px] top-[250px] h-[58px] w-[4px] rounded-l-sm bg-[#3a3a3f]" aria-hidden />
        <span className="absolute -right-[3px] top-[210px] h-[92px] w-[4px] rounded-r-sm bg-[#3a3a3f]" aria-hidden />

        <div className="absolute inset-0 rounded-[66px] bg-gradient-to-br from-[#6b6b70] via-[#2a2a2d] to-[#55555a] p-[3px] shadow-[0_40px_90px_-25px_rgba(6,20,40,0.6),0_10px_30px_-10px_rgba(0,0,0,0.35)]">
          <div className="h-full w-full rounded-[63px] bg-black p-[11px]">
            <div className="relative h-full w-full overflow-hidden rounded-[52px] bg-white">
              {children}
              {/* Dynamic Island */}
              <div className="pointer-events-none absolute left-1/2 top-[11px] z-50 h-[34px] w-[122px] -translate-x-1/2 rounded-full bg-black" aria-hidden>
                <span className="absolute right-[14px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full bg-[#10131c] ring-1 ring-[#1d2230]" />
              </div>
              {/* Home indicator */}
              <div className="pointer-events-none absolute bottom-[8px] left-1/2 z-50 h-[5px] w-[136px] -translate-x-1/2 rounded-full bg-black" aria-hidden />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
