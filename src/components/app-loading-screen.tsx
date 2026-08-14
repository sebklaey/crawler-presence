import { useEffect, useState } from "react";

/**
 * Full-screen loading splash shown once per browser session,
 * styled after the Crawler URL preview image.
 */
export function AppLoadingScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("crawler.splash.seen") === "1") {
      setVisible(false);
      return;
    }
    const fadeTimer = window.setTimeout(() => setFading(true), 1100);
    const hideTimer = window.setTimeout(() => {
      window.sessionStorage.setItem("crawler.splash.seen", "1");
      setVisible(false);
    }, 1700);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#050505] transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <img
        src="/og-image.png"
        alt=""
        width={1200}
        height={630}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70 select-none"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/40 via-transparent to-[#050505]/90" />

      <div className="relative flex flex-col items-center gap-6 px-6 text-center">
        <p className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Crawler<span className="text-[#b6f13a]">.today</span>
        </p>
        <div className="h-px w-40 overflow-hidden bg-white/15">
          <div className="h-full w-1/3 animate-[splash-slide_1.2s_ease-in-out_infinite] bg-[#b6f13a]" />
        </div>
        <p className="text-xs tracking-[0.28em] text-white/50 uppercase">Loading your presence</p>
      </div>

      <style>{`@keyframes splash-slide{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}`}</style>
    </div>
  );
}
