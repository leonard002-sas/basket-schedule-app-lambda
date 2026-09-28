/**
 * ログイン後のすべての画面で共通して使うアカウント操作です。
 * 権限表示は画面上の案内に限り、実際の許可はAPI側で検証します。
 */
(function initializeAccountMenu() {
    "use strict";

    const cognitoDomain = "https://ap-northeast-1cd5fxlwj3.auth.ap-northeast-1.amazoncognito.com";
    const cognitoApiEndpoint = "https://cognito-idp.ap-northeast-1.amazonaws.com/";
    const clientId = "3mr9ep2rosop9ratlg1l3bta70";
    const redirectUri = "https://d13o4oynf3jxlu.cloudfront.net";
    const accountMenu = document.getElementById("accountMenu");
    const logoutButton = document.getElementById("logoutButton");
    const deleteButton = document.getElementById("deleteAccountButton");
    const deleteDialog = document.getElementById("accountDeleteDialog");
    const deleteForm = document.getElementById("accountDeleteForm");

    /** 表示用の判断に使うJWTペイロードを読み取ります。 */
    function readJwtClaims(token) {
        try {
            const encodedPayload = token.split(".")[1];
            const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
            const normalizedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
            return JSON.parse(atob(normalizedBase64));
        } catch {
            return null;
        }
    }

    /** ブラウザー内のトークンを消去し、Cognitoのサインアウト画面へ移動します。 */
    function signOut() {
        ["id_token", "access_token", "refresh_token"].forEach((key) =>
            localStorage.removeItem(key),
        );
        const logoutUrl = new URL(`${cognitoDomain}/logout`);
        logoutUrl.searchParams.set("client_id", clientId);
        logoutUrl.searchParams.set("logout_uri", redirectUri);
        window.location.assign(logoutUrl.toString());
    }

    /** ログインまたはトークン更新後に、アカウント情報と権限表示を更新します。 */
    function refreshAccountMenu() {
        const identity = readJwtClaims(localStorage.getItem("id_token") || "");
        const access = readJwtClaims(localStorage.getItem("access_token") || "");
        const tokenIsValid = identity && Number(identity.exp) * 1000 > Date.now();
        if (!accountMenu) return;
        accountMenu.hidden = !tokenIsValid;
        if (!tokenIsValid) return;

        const isAdmin =
            Array.isArray(identity["cognito:groups"]) &&
            identity["cognito:groups"].includes("admins");
        const email =
            identity.email || identity["cognito:username"] || identity.sub || "ログイン中";
        const label = String(email).split("@")[0];

        accountMenu.hidden = false;
        document.getElementById("accountDisplayName").textContent = label;
        document.getElementById("accountEmail").textContent = email;
        document.getElementById("accountRoleLabel").textContent = isAdmin
            ? "管理者"
            : "ゲスト・閲覧のみ";
        document.getElementById("adminDeletionWarning").hidden = !isAdmin;
        document.getElementById("accountAccessDescription").textContent = isAdmin
            ? "予定、施設、チーム、試合を登録・管理できます。"
            : "予定や試合結果を閲覧できます。登録・編集は管理者のみ行えます。";

        const scopes = String(access?.scope || "").split(/\s+/);
        const canDeleteOwnAccount = scopes.includes("aws.cognito.signin.user.admin");
        if (deleteButton && !canDeleteOwnAccount) {
            deleteButton.disabled = true;
            deleteButton.title =
                "Cognitoのアプリクライアントに aws.cognito.signin.user.admin スコープを設定して、再ログインしてください。";
        } else if (deleteButton) {
            deleteButton.disabled = false;
            deleteButton.title = "ログインアカウントを完全に削除します。";
        }
    }

    window.refreshCourtsideAccountMenu = refreshAccountMenu;
    document.addEventListener("courtside:auth-changed", refreshAccountMenu);
    refreshAccountMenu();

    logoutButton?.addEventListener("click", signOut);

    document.addEventListener("pointerdown", (event) => {
        if (accountMenu && !accountMenu.contains(event.target)) accountMenu.open = false;
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && accountMenu) accountMenu.open = false;
    });

    deleteButton?.addEventListener("click", () => {
        if (!deleteDialog) return;
        document.getElementById("accountDeleteConfirmation").value = "";
        document.getElementById("confirmAccountDelete").disabled = true;
        document.getElementById("accountDeleteStatus").textContent = "";
        deleteDialog.showModal();
    });

    document
        .getElementById("cancelAccountDelete")
        ?.addEventListener("click", () => deleteDialog?.close());
    document.getElementById("accountDeleteConfirmation")?.addEventListener("input", (event) => {
        document.getElementById("confirmAccountDelete").disabled =
            event.target.value.trim() !== "削除する";
    });

    deleteForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = document.getElementById("confirmAccountDelete");
        const status = document.getElementById("accountDeleteStatus");
        if (
            !readJwtClaims(localStorage.getItem("access_token") || "")
                ?.scope?.split(/\s+/)
                .includes("aws.cognito.signin.user.admin")
        ) {
            status.textContent =
                "削除権限がありません。アプリクライアントの設定後、ログインし直してください。";
            return;
        }

        submitButton.disabled = true;
        status.textContent = "アカウントを削除しています…";
        try {
            const response = await fetch(cognitoApiEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-amz-json-1.1",
                    "X-Amz-Target": "AWSCognitoIdentityProviderService.DeleteUser",
                },
                body: JSON.stringify({ AccessToken: localStorage.getItem("access_token") }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(
                    error.message ||
                        "削除できませんでした。Cognitoのスコープ設定を確認してください。",
                );
            }

            signOut();
        } catch (error) {
            status.textContent = error.message;
            submitButton.disabled = false;
        }
    });
})();
