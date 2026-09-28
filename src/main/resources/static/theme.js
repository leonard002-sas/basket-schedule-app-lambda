(function () {
    const KEY = "courtside_theme";
    const saved = localStorage.getItem(KEY);
    document.documentElement.dataset.theme = saved === "dark" ? "dark" : "light";

    function paintButton() {
        document.querySelectorAll("[data-theme-toggle]").forEach(button => {
            const dark = document.documentElement.dataset.theme === "dark";
            button.textContent = dark ? "☀ ライト" : "☾ ダーク";
            button.setAttribute("aria-label", dark ? "ライトモードに切り替え" : "ダークモードに切り替え");
            button.setAttribute("aria-pressed", String(dark));
        });
    }

    document.addEventListener("DOMContentLoaded", paintButton);
    document.addEventListener("click", event => {
        const button = event.target.closest("[data-theme-toggle]");
        if (!button) return;
        const dark = document.documentElement.dataset.theme !== "dark";
        document.documentElement.dataset.theme = dark ? "dark" : "light";
        localStorage.setItem(KEY, dark ? "dark" : "light");
        paintButton();
    });
    paintButton();
})();

