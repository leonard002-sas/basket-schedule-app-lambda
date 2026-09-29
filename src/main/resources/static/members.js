"use strict";

const USER_ADMIN_API = "https://7yxh3p2c5swyx6ajv45ldmiswe0tirop.lambda-url.ap-northeast-1.on.aws/";
const currentIdToken = localStorage.getItem("id_token") || "";
const managedUsers = [];
const usersList = document.getElementById("userList");
const usersStatus = document.getElementById("userManagementStatus");

function readClaims(token) {
    try {
        const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(atob(payload + "=".repeat((4 - (payload.length % 4)) % 4)));
    } catch {
        return null;
    }
}

function html(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
        const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        return entities[character];
    });
}

function formatDate(value) {
    if (!value) return "日時なし";
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
        ? "日時なし"
        : new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(date);
}

async function usersApi(method = "GET", body, username) {
    const query = new URLSearchParams({ feature: "basketball", resource: "users" });
    if (username) query.set("username", username);
    const response = await fetch(`${USER_ADMIN_API}?${query}`, {
        method,
        headers: {
            Authorization: `Bearer ${currentIdToken}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(
            `${result.message || `Request failed (${response.status})`}${result.code ? ` · ${result.code}` : ""}`,
        );
    }
    return result;
}

function renderUsers() {
    const query = document.getElementById("userSearch").value.trim().toLocaleLowerCase("ja-JP");
    const filtered = managedUsers.filter((user) =>
        `${user.email || ""} ${user.username || ""}`.toLocaleLowerCase("ja-JP").includes(query),
    );
    document.getElementById("totalUsers").textContent = managedUsers.length;
    document.getElementById("adminUsers").textContent = managedUsers.filter(
        (user) => user.role === "admin" || user.role === "root-admin",
    ).length;
    document.getElementById("disabledUsers").textContent = managedUsers.filter(
        (user) => !user.enabled,
    ).length;
    if (!filtered.length) {
        usersList.innerHTML = '<div class="empty-state">一致するユーザーはいません。</div>';
        return;
    }
    usersList.innerHTML = filtered
        .map((user) => {
            const isSelf = user.sub === readClaims(currentIdToken)?.sub;
            const roleLabel =
                user.role === "root-admin"
                    ? "ルート管理者"
                    : user.role === "admin"
                      ? "管理者"
                      : "メンバー";
            const roleAction = user.role === "admin" ? "demote-admin" : "promote-admin";
            const roleActionLabel = user.role === "admin" ? "管理者を解除" : "管理者に昇格";
            const safeUsername = html(user.username);
            const actions =
                user.role === "root-admin" || isSelf
                    ? '<span class="user-state-badge">保護されています</span>'
                    : `<button type="button" class="button-light" data-user-action="${roleAction}" data-username="${safeUsername}">${roleActionLabel}</button><button type="button" class="button-light" data-user-action="${user.enabled ? "disable" : "enable"}" data-username="${safeUsername}">${user.enabled ? "利用停止" : "利用再開"}</button><button type="button" class="button-danger" data-user-action="delete" data-username="${safeUsername}" data-email="${html(user.email)}">削除</button>`;
            return `<article class="managed-user"><div class="managed-user-identity"><strong>${html(user.email || user.username)}</strong><span>${user.emailVerified ? "メール確認済み" : "メール未確認"} · ${html(user.status || "状態不明")}</span></div><div class="managed-user-state"><span class="user-state-badge">${roleLabel}</span>${user.enabled ? '<span class="user-state-badge">利用中</span>' : '<span class="user-state-badge is-disabled">停止中</span>'}</div><span class="managed-user-date">登録 ${formatDate(user.createdAt)}</span><div class="managed-user-actions">${actions}</div></article>`;
        })
        .join("");
}

async function loadUsers() {
    usersStatus.textContent = "ユーザー情報を読み込んでいます…";
    try {
        managedUsers.splice(0, managedUsers.length, ...(await usersApi()));
        renderUsers();
        usersStatus.textContent = `${managedUsers.length}人のユーザーを読み込みました。`;
    } catch (error) {
        usersStatus.textContent = error.message;
    }
}

async function handleUserAction(event) {
    const button = event.target.closest("[data-user-action]");
    if (!button) return;
    const username = button.dataset.username;
    const action = button.dataset.userAction;
    const email = button.dataset.email || username;
    const prompts = {
        "promote-admin": `${email} を管理者に昇格しますか？管理者は予定やスコアを登録・変更できます。`,
        "demote-admin": `${email} の管理者権限を解除しますか？`,
        disable: `${email} のログインを停止しますか？共有データは削除されません。`,
        enable: `${email} のログインを再開しますか？`,
        delete: `${email} のアカウントを完全に削除しますか？この操作は取り消せません。共有データは残ります。`,
    };
    if (!window.confirm(prompts[action])) return;
    button.disabled = true;
    usersStatus.textContent = "変更を保存しています…";
    try {
        if (action === "delete") await usersApi("DELETE", undefined, username);
        else await usersApi("PUT", { username, action });
        await loadUsers();
        usersStatus.textContent = "ユーザー情報を更新しました。";
    } catch (error) {
        usersStatus.textContent = error.message;
        button.disabled = false;
    }
}

const currentClaims = readClaims(currentIdToken);
if (!currentClaims || Number(currentClaims.exp) * 1000 <= Date.now()) {
    window.location.replace("index.html");
} else if (!(currentClaims["cognito:groups"] || []).some((group) => ["admins", "root-admins"].includes(group))) {
    document.getElementById("rootAdminRequired").hidden = false;
} else {
    document.getElementById("userManagementWorkspace").hidden = false;
    loadUsers();
}

document.getElementById("userSearch").addEventListener("input", renderUsers);
usersList.addEventListener("click", handleUserAction);
