/* ==========================================================
   London Community Watch - theme switcher (shared by all pages)
   - Applies the saved preference (localStorage "lcw-theme") on load,
     falling back to the system dark/light setting.
   - #theme-toggle button toggles body.dark-theme and persists it.
   - dashboard.js watches body's class, so charts restyle automatically.
   ========================================================== */

"use strict";

(function () {
  const KEY = "lcw-theme";

  function apply(theme) {
    document.body.classList.toggle("dark-theme", theme === "dark");
  }

  function current() {
    return document.body.classList.contains("dark-theme") ? "dark" : "light";
  }

  // 1. Initial theme: saved preference wins, otherwise follow the OS.
  const saved = localStorage.getItem(KEY);
  if (saved) {
    apply(saved);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    apply("dark");
  }

  // 2. Wire the toggle button (present in the header on every page).
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      apply(next);
      localStorage.setItem(KEY, next);
    });
  }

  // 3. If the user has no saved preference, follow live OS changes.
  if (!saved && window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!localStorage.getItem(KEY)) apply(e.matches ? "dark" : "light");
    });
  }
})();
