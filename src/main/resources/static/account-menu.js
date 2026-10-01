/**
 * Adds the same signed-in account menu to every application page.
 * The server remains responsible for checking every privileged operation.
 */
(function initializeAccountMenu() {
    "use strict";

    const {
        cognitoDomain,
        apiUrl: scoreApi,
        cognitoClientId: clientId,
        redirectUri,
    } = window.BasketScheduleConfig;
    const headerActions = document.querySelector(
        ".header-actions, .register-header-actions, .scorebook-header-actions",
    );
    if (!headerActions) return;

    const menu = document.createElement("details");
    menu.className = "account-menu";
    menu.hidden = true;

    const summary = document.createElement("summary");
    summary.className = "account-menu-trigger";
    summary.setAttribute("aria-label", "アカウントメニュー");
    summary.innerHTML =
        '<span class="account-avatar" aria-hidden="true">FP</span><span class="account-menu-trigger-label">アカウント</span><span class="account-menu-chevron" aria-hidden="true">⌄</span>';

    const panel = document.createElement("div");
    panel.className = "account-menu-panel";
    panel.innerHTML = `
        <div class="account-menu-identity">
            <strong data-account-name></strong>
            <span data-account-email></span>
            <span class="account-role-badge" data-account-role></span>
        </div>
        <a href="members.html" class="account-menu-item" data-admin-link hidden>ユーザー管理</a>
        <button type="button" class="account-menu-item" data-profile-name>表示名を設定</button>
        <button type="button" class="account-menu-item" data-google-link>Googleアカウントを連携</button>
        <button type="button" class="account-menu-item account-menu-delete" data-delete-account>アカウントを削除</button>
        <button type="button" class="account-menu-item" data-account-logout>ログアウト</button>
        <p class="account-menu-note" data-account-note></p>`;
    menu.append(summary, panel);
    headerActions.append(menu);

    const dialog = document.createElement("dialog");
    dialog.className = "account-delete-dialog";
    dialog.innerHTML = `
        <form method="dialog" data-delete-form>
            <span class="eyebrow">ACCOUNT</span>
            <h2>アカウントを削除しますか？</h2>
            <p>このログインアカウントを削除します。チームの予定、選手、試合記録など共有データは削除されません。</p>
            <label for="accountDeletePhrase">確認のため「削除」と入力してください。</label>
            <input id="accountDeletePhrase" name="confirmation" autocomplete="off" required />
            <p class="account-delete-status" role="status" aria-live="polite" data-delete-status></p>
            <div class="dialog-actions">
                <button type="button" class="button-light" data-cancel-delete>キャンセル</button>
                <button type="submit" class="button-danger" data-confirm-delete disabled>アカウントを削除</button>
            </div>
        </form>`;
    document.body.append(dialog);

    function readClaims(token) {
        try {
            const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
            return JSON.parse(atob(payload + "=".repeat((4 - (payload.length % 4)) % 4)));
        } catch {
            return null;
        }
    }

    function clearTokens() {
        ["id_token", "access_token", "refresh_token"].forEach((key) =>
            localStorage.removeItem(key),
        );
        sessionStorage.removeItem("google_linked");
    }

    function signOut() {
        clearTokens();
        const url = new URL(`${cognitoDomain}/logout`);
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("logout_uri", redirectUri);
        window.location.assign(url.toString());
    }

    function startGoogleLink() {
        const nativeToken = localStorage.getItem("id_token");
        if (!nativeToken) return;
        const state =
            globalThis.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem("google_link_state", state);
        sessionStorage.setItem("google_link_native_token", nativeToken);
        const url = new URL(`${cognitoDomain}/oauth2/authorize`);
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("response_type", "code");
        // 現在のCognitoアプリクライアントで許可しているスコープだけを要求します。
        url.searchParams.set("scope", "openid email phone");
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("identity_provider", "Google");
        url.searchParams.set("state", state);
        url.searchParams.set("lang", "ja");
        window.location.assign(url.toString());
    }

    async function editDisplayName() {
        const current = panel.querySelector("[data-account-name]").textContent;
        const displayName = globalThis.prompt(
            "予定の出欠一覧に表示する名前を入力してください。",
            current,
        );
        if (displayName === null) return;
        const value = displayName.trim();
        if (value.length > 40) {
            globalThis.alert("表示名は40文字以内で入力してください。");
            return;
        }
        try {
            const response = await fetch(`${scoreApi}?resource=profile`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("id_token") || ""}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ displayName: value }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.message || "表示名を保存できませんでした。");
            panel.querySelector("[data-account-name]").textContent = value || current;
            globalThis.alert("表示名を保存しました。");
        } catch (error) {
            globalThis.alert(error.message);
        }
    }

    function refresh() {
        const claims = readClaims(localStorage.getItem("id_token") || "");
        const valid = claims && Number(claims.exp) * 1000 > Date.now();
        menu.hidden = !valid;
        const adminLinks = document.querySelectorAll("[data-admin-only]");
        if (!valid) {
            adminLinks.forEach((link) => {
                link.hidden = true;
            });
            return;
        }

        const groups = Array.isArray(claims["cognito:groups"]) ? claims["cognito:groups"] : [];
        const isRootAdmin = groups.includes("root-admins");
        const isAdmin = isRootAdmin || groups.includes("admins");
        const email = claims.email || claims["cognito:username"] || "ログイン中のメンバー";
        const name = String(email).split("@")[0];
        panel.querySelector("[data-account-name]").textContent = name;
        panel.querySelector("[data-account-email]").textContent = email;
        panel.querySelector("[data-account-role]").textContent = isRootAdmin
            ? "ルート管理者"
            : isAdmin
              ? "管理者"
              : "メンバー閲覧のみ";
        panel.querySelector("[data-admin-link]").hidden = !isAdmin;
        const googleLinked = Array.isArray(claims.identities)
            ? claims.identities.some((identity) => identity.providerName === "Google")
            : sessionStorage.getItem("google_linked") === "1";
        const googleLinkButton = panel.querySelector("[data-google-link]");
        googleLinkButton.disabled = googleLinked;
        googleLinkButton.textContent = googleLinked
            ? "Googleアカウント連携済み"
            : "Googleアカウントを連携";
        adminLinks.forEach((link) => {
            link.hidden = !isAdmin;
        });
        panel.querySelector("[data-account-note]").textContent = isRootAdmin
            ? "root管理者を削除するには、別の有効なroot管理者が必要です。"
            : "アカウントを削除してもチームの共有データは残ります。";
        summary.querySelector(".account-avatar").textContent =
            Array.from(name.trim())[0]?.toUpperCase() || "FP";
        panel.querySelector("[data-delete-account]").hidden = false;
        fetch(`${scoreApi}?resource=profile`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("id_token") || ""}` },
        })
            .then((response) => response.json())
            .then((profile) => {
                if (profile.displayName)
                    panel.querySelector("[data-account-name]").textContent = profile.displayName;
            })
            .catch(() => {});
    }

    document.addEventListener("app:auth-changed", refresh);
    document.addEventListener("click", (event) => {
        if (!menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") menu.open = false;
    });
    panel.querySelector("[data-account-logout]").addEventListener("click", signOut);
    panel.querySelector("[data-profile-name]").addEventListener("click", editDisplayName);
    panel.querySelector("[data-google-link]").addEventListener("click", startGoogleLink);
    panel.querySelector("[data-delete-account]").addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Android WebViewなどではdialogが画面外になる場合があるため、タッチ端末は
        // 標準の確認入力を使って確実に操作できるようにします。
        if (globalThis.matchMedia?.("(pointer: coarse)").matches) {
            const confirmation = globalThis.prompt(
                "アカウントを削除します。確認のため「削除」と入力してください。",
                "",
            );
            if (confirmation === "削除") deleteAccount();
            return;
        }
        dialog.querySelector("[data-delete-status]").textContent = "";
        dialog.querySelector("[name=confirmation]").value = "";
        dialog.querySelector("[data-confirm-delete]").disabled = true;
        // 一部のスマホブラウザやWebViewではshowModalが利用できないため、フォールバックします。
        try {
            if (typeof dialog.showModal === "function") dialog.showModal();
            else dialog.setAttribute("open", "");
        } catch (error) {
            dialog.setAttribute("open", "");
            dialog.querySelector("[data-delete-status]").textContent =
                "削除確認画面を開けませんでした。もう一度お試しください。";
            console.error("アカウント削除ダイアログを開けませんでした", error);
        }
        menu.open = false;
    });
    dialog.querySelector("[data-cancel-delete]").addEventListener("click", (event) => {
        event.preventDefault();
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
    });
    dialog.querySelector("[name=confirmation]").addEventListener("input", (event) => {
        dialog.querySelector("[data-confirm-delete]").disabled =
            event.target.value.trim() !== "削除";
    });
    async function deleteAccount() {
        const button = dialog.querySelector("[data-confirm-delete]");
        const status = dialog.querySelector("[data-delete-status]");
        button.disabled = true;
        status.textContent = "アカウントを削除しています…";
        try {
            const query = new URLSearchParams({ feature: "basketball", resource: "account" });
            const response = await fetch(`${scoreApi}?${query}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${localStorage.getItem("id_token") || ""}` },
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(result.message || "アカウントを削除できませんでした。");
            clearTokens();
            window.location.assign("index.html?account-deleted=1");
        } catch (error) {
            status.textContent = error.message;
            button.disabled = false;
            if (globalThis.matchMedia?.("(pointer: coarse)").matches) {
                globalThis.alert(error.message);
            }
        }
    }

    dialog.querySelector("[data-delete-form]").addEventListener("submit", async (event) => {
        event.preventDefault();
        await deleteAccount();
    });

    refresh();
})();
