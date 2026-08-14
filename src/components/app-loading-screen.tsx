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
    </div>
  );
}
