/* ==========================================================
   London Community Watch - theme switcher (shared by all pages)
   - Applies dark/light theme to <html> and <body> immediately
   - Defaults to dark theme or saved user preference
   ========================================================== */

"use strict";

(function () {
  const KEY = "lcw-theme";

  function apply(theme) {
    const isDark = theme === "dark";
    if (document.documentElement) {
      document.documentElement.classList.toggle("dark-theme", isDark);
    }
    if (document.body) {
      document.body.classList.toggle("dark-theme", isDark);
    }
  }

  function current() {
    return (document.body && document.body.classList.contains("dark-theme")) ||
           (document.documentElement && document.documentElement.classList.contains("dark-theme"))
      ? "dark"
      : "light";
  }

  // 1. Initial theme check (Immediate execution)
  const saved = localStorage.getItem(KEY);
  if (saved) {
    apply(saved);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    apply("dark");
  } else {
    apply("dark"); // Default dark mode
  }

  // 2. Wire toggle buttons on DOM load
  function initToggle() {
    // Re-apply to body once body is ready
    const theme = saved || "dark";
    apply(theme);

    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.onclick = function () {
        const next = current() === "dark" ? "light" : "dark";
        apply(next);
        localStorage.setItem(KEY, next);
      };
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initToggle);
  } else {
    initToggle();
  }

  // 3. Live OS scheme listener
  if (!saved && window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!localStorage.getItem(KEY)) apply(e.matches ? "dark" : "light");
    });
  }
})();
