// Sun/moon theme toggle, shared by every page. Follows the device until the
// visitor picks; the choice is remembered on this device only.
(() => {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const setTheme = (t) => {
    document.documentElement.dataset.theme = t;
    const next = t === "dark" ? "light" : "dark";
    btn.setAttribute("aria-label", `Switch to ${next} mode`);
    btn.title = `Switch to ${next} mode`;
  };
  const savedTheme = () => { try { return localStorage.getItem("mr-theme"); } catch { return null; } };
  btn.addEventListener("click", () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("mr-theme", t); } catch { /* ignore */ }
    setTheme(t);
  });
  const deviceDark = matchMedia("(prefers-color-scheme: dark)");
  deviceDark.addEventListener?.("change", (e) => { if (!savedTheme()) setTheme(e.matches ? "dark" : "light"); });
  setTheme(document.documentElement.dataset.theme || (deviceDark.matches ? "dark" : "light"));
})();
