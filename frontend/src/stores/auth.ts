import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { config } from "../config";

interface Claims {
    sub: string;
    email?: string;
    exp: number;
    "cognito:username"?: string;
    "cognito:groups"?: string[];
}

function decodeClaims(token: string | null): Claims | null {
    if (!token) return null;
    try {
        const value = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const claims = JSON.parse(atob(value + "=".repeat((4 - (value.length % 4)) % 4))) as Claims;
        return claims.exp * 1000 > Date.now() ? claims : null;
    } catch {
        return null;
    }
}

function clearTokens(): void {
    ["id_token", "access_token", "refresh_token"].forEach((key) => localStorage.removeItem(key));
}

export const useAuthStore = defineStore("auth", () => {
    const claims = ref<Claims | null>(decodeClaims(localStorage.getItem("id_token")));
    const callbackPending = ref(false);
    const callbackError = ref("");

    const isAuthenticated = computed(() => Boolean(claims.value));
    const groups = computed(() => claims.value?.["cognito:groups"] ?? []);
    const isRootAdmin = computed(() => groups.value.includes("root-admins"));
    const isAdmin = computed(() => isRootAdmin.value || groups.value.includes("admins"));
    const email = computed(
        () => claims.value?.email || claims.value?.["cognito:username"] || "メンバー",
    );

    function login(provider?: "Google"): void {
        const url = new URL(`${config.cognitoDomain}/oauth2/authorize`);
        url.searchParams.set("client_id", config.cognitoClientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "openid email phone");
        url.searchParams.set("redirect_uri", config.redirectUri);
        url.searchParams.set("lang", "ja");
        if (provider) url.searchParams.set("identity_provider", provider);
        window.location.assign(url.toString());
    }

    async function handleCallback(): Promise<boolean> {
        const code = new URLSearchParams(window.location.search).get("code");
        if (!code) return false;
        callbackPending.value = true;
        callbackError.value = "";
        try {
            const response = await fetch(`${config.cognitoDomain}/oauth2/token`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    grant_type: "authorization_code",
                    client_id: config.cognitoClientId,
                    code,
                    redirect_uri: config.redirectUri,
                }),
            });
            const tokens = await response.json();
            if (!response.ok) throw new Error(tokens.error_description || "ログインに失敗しました");
            localStorage.setItem("id_token", tokens.id_token);
            localStorage.setItem("access_token", tokens.access_token);
            if (tokens.refresh_token) localStorage.setItem("refresh_token", tokens.refresh_token);
            claims.value = decodeClaims(tokens.id_token);
            window.history.replaceState({}, document.title, window.location.pathname);
            return true;
        } catch (error) {
            callbackError.value = error instanceof Error ? error.message : "ログインに失敗しました";
            clearTokens();
            claims.value = null;
            return false;
        } finally {
            callbackPending.value = false;
        }
    }

    function logout(): void {
        clearTokens();
        claims.value = null;
        const url = new URL(`${config.cognitoDomain}/logout`);
        url.searchParams.set("client_id", config.cognitoClientId);
        url.searchParams.set("logout_uri", config.logoutUri);
        window.location.assign(url.toString());
    }

    return {
        claims,
        email,
        isAuthenticated,
        isAdmin,
        isRootAdmin,
        callbackPending,
        callbackError,
        login,
        logout,
        handleCallback,
    };
});
