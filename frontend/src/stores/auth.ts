import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { config } from "../config";
import { linkGoogleAccount } from "../services/api";

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

    function linkGoogle(): void {
        const token = localStorage.getItem("id_token");
        if (!token) return;
        const state = crypto.randomUUID();
        sessionStorage.setItem("google_link_state", state);
        const url = new URL(`${config.cognitoDomain}/oauth2/authorize`);
        url.searchParams.set("client_id", config.cognitoClientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "openid email phone");
        url.searchParams.set("redirect_uri", config.redirectUri);
        url.searchParams.set("identity_provider", "Google");
        url.searchParams.set("state", state);
        url.searchParams.set("lang", "ja");
        window.location.assign(url.toString());
    }

    function signupWithGoogle(): void {
        const state = crypto.randomUUID();
        sessionStorage.setItem("google_signup_state", state);
        const url = new URL(`${config.cognitoDomain}/oauth2/authorize`);
        url.searchParams.set("client_id", config.cognitoClientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "openid email phone");
        url.searchParams.set("redirect_uri", config.redirectUri);
        url.searchParams.set("identity_provider", "Google");
        url.searchParams.set("state", state);
        url.searchParams.set("lang", "ja");
        window.location.assign(url.toString());
    }

    function clearSession(): void {
        clearTokens();
        claims.value = null;
    }

    async function handleCallback(): Promise<boolean> {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const expectedLinkState = sessionStorage.getItem("google_link_state");
        const isLinkFlow = Boolean(expectedLinkState && params.get("state") === expectedLinkState);
        const expectedSignupState = sessionStorage.getItem("google_signup_state");
        const isSignupFlow = Boolean(
            expectedSignupState && params.get("state") === expectedSignupState,
        );
        if (params.get("error") && isLinkFlow) {
            sessionStorage.removeItem("google_link_state");
            callbackError.value = params.get("error_description") || "Google連携を中止しました";
            window.history.replaceState({}, document.title, window.location.pathname);
            return false;
        }
        if (params.get("error") && isSignupFlow) {
            sessionStorage.removeItem("google_signup_state");
            callbackError.value =
                params.get("error_description") || "Googleでの参加申請を中止しました";
            window.history.replaceState({}, document.title, window.location.pathname);
            return false;
        }
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
            if (isLinkFlow) {
                await linkGoogleAccount(tokens.id_token);
                sessionStorage.removeItem("google_link_state");
                window.history.replaceState({}, document.title, window.location.pathname);
                window.alert(
                    "Googleアカウントを連携しました。次回からGoogleでもログインできます。",
                );
                return true;
            }
            localStorage.setItem("id_token", tokens.id_token);
            localStorage.setItem("access_token", tokens.access_token);
            if (tokens.refresh_token) localStorage.setItem("refresh_token", tokens.refresh_token);
            claims.value = decodeClaims(tokens.id_token);
            window.history.replaceState({}, document.title, window.location.pathname);
            if (isSignupFlow) {
                sessionStorage.removeItem("google_signup_state");
                window.location.hash = "#/join?google=1";
            }
            return true;
        } catch (error) {
            callbackError.value = error instanceof Error ? error.message : "ログインに失敗しました";
            if (!isLinkFlow) {
                clearTokens();
                claims.value = null;
            }
            sessionStorage.removeItem("google_link_state");
            sessionStorage.removeItem("google_signup_state");
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
        linkGoogle,
        signupWithGoogle,
        clearSession,
        logout,
        handleCallback,
    };
});
