(function (global) {
  const STORAGE_KEY = "kg_theme_pref";

  function systemTheme() {
    return global.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function resolveTheme(preference) {
    if (preference === "dark" || preference === "light") return preference;
    return systemTheme();
  }

  function getPreference() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") return saved;
    } catch {}
    return "system";
  }

  function applyResolved(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
    updateToggleUi();
    global.dispatchEvent(new CustomEvent("kg-theme-change", { detail: { theme, preference: getPreference() } }));
  }

  function setPreference(preference) {
    const pref = preference === "dark" || preference === "light" || preference === "system" ? preference : "system";
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {}
    applyResolved(resolveTheme(pref));
    if (global.lucide?.createIcons) global.lucide.createIcons();
  }

  function updateToggleUi() {
    const pref = getPreference();
    document.querySelectorAll("[data-theme-pref]").forEach((btn) => {
      const on = btn.getAttribute("data-theme-pref") === pref;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function initTheme() {
    applyResolved(resolveTheme(getPreference()));
    global.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (getPreference() === "system") applyResolved(systemTheme());
    });
  }

  global.setThemePreference = setPreference;
  global.getThemePreference = getPreference;
  global.getResolvedTheme = () => resolveTheme(getPreference());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
  } else {
    initTheme();
  }
})(window);
