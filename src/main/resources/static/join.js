/* global AmazonCognitoIdentity */
const config = window.BasketScheduleConfig;
const pool = new AmazonCognitoIdentity.CognitoUserPool({
    UserPoolId: "ap-northeast-1_Cd5fxLwj3",
    ClientId: config.cognitoClientId,
});
const form = document.getElementById("joinForm");
const errorElement = document.getElementById("joinError");
let pendingRequest;

function startGoogleSignup() {
    const state =
        globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function setupGoogleProfile() {
    const profilePanel = document.getElementById("googleProfilePanel");
    const joinForm = document.getElementById("joinForm");
    const googlePanel = document.getElementById("googleJoinPanel");
    if (new URLSearchParams(window.location.search).get("google") !== "1") return;
    if (!localStorage.getItem("id_token")) return;
    joinForm.hidden = true;
    googlePanel.hidden = true;
    profilePanel.hidden = false;
    document.getElementById("googleProfileSave").addEventListener("click", async () => {
        const displayName = document.getElementById("googleDisplayName").value.trim();
        const message = document.getElementById("googleMessage").value.trim();
        const profileError = document.getElementById("googleProfileError");
        if (!displayName) {
            profileError.textContent = "表示名を入力してください。";
            profileError.hidden = false;
            return;
        }
        try {
            const token = localStorage.getItem("id_token");
            const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
            const claims = JSON.parse(atob(payload + "=".repeat((4 - (payload.length % 4)) % 4)));
            const response = await fetch(`${config.apiUrl}?resource=profile`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    displayName,
                    message,
                    email: claims.email || "",
                    joinRequest: true,
                    notificationOffsets: "NONE",
                }),
            });
            if (!response.ok) throw new Error("表示名を保存できませんでした。");
            localStorage.removeItem("id_token");
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            profilePanel.innerHTML =
                "<p>参加申請を受け付けました。管理者が確認して承認するまでお待ちください。</p>";
        } catch (error) {
            profileError.textContent = error.message;
            profileError.hidden = false;
        }
    });
}

document.getElementById("googleJoinButton")?.addEventListener("click", startGoogleSignup);
setupGoogleProfile();
function error(message) {
    errorElement.textContent = message;
    errorElement.hidden = false;
}
form.addEventListener("submit", (event) => {
    event.preventDefault();
    errorElement.hidden = true;
    const displayName = document.getElementById("displayName").value.trim();
    const email = document.getElementById("email").value.trim();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const message = document.getElementById("message").value.trim();
    if (!displayName || !email || !username || password.length < 8) {
        error("必須項目を入力してください。パスワードは8文字以上です。");
        return;
    }
    pendingRequest = { displayName, email, username, message };
    const attributes = [
        new AmazonCognitoIdentity.CognitoUserAttribute({ Name: "email", Value: email }),
    ];
    pool.signUp(username, password, attributes, null, async (signUpError, result) => {
        if (signUpError) {
            console.error("参加申請のCognito登録エラー", signUpError);
            error(
                signUpError.code === "UsernameExistsException"
                    ? "このユーザー名はすでに登録されています。"
                    : signUpError.code === "InvalidPasswordException"
                      ? "パスワードの条件を満たしていません。大文字・小文字・数字・記号を含めてください。"
                      : signUpError.code === "InvalidParameterException"
                        ? "メールアドレスまたは入力内容が正しくありません。"
                        : "登録できませんでした。入力内容を確認してください。",
            );
            return;
        }
        try {
            const response = await fetch(`${config.apiUrl}?resource=join-request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(pendingRequest),
            });
            if (!response.ok) throw new Error();
            form.innerHTML =
                "<p>参加申請を受け付けました。管理者が確認して承認するまでお待ちください。</p><a class='signin-submit' href='signin.html'>サインイン画面へ</a>";
        } catch {
            error("申請情報の保存に失敗しました。管理者へ連絡してください。");
        }
    });
});
