/* global AmazonCognitoIdentity */

const config = window.BasketScheduleConfig;
const pool = new AmazonCognitoIdentity.CognitoUserPool({
    UserPoolId: "ap-northeast-1_Cd5fxLwj3",
    ClientId: config.cognitoClientId,
});

const form = document.getElementById("signinForm");
const errorElement = document.getElementById("signinError");
const submitButton = document.getElementById("signinSubmit");

function showError(message) {
    errorElement.textContent = message;
    errorElement.hidden = false;
}

function redirectToGoogle() {
    const url = new URL(`${config.cognitoDomain}/oauth2/authorize`);
    url.searchParams.set("client_id", config.cognitoClientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email phone");
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("identity_provider", "Google");
    url.searchParams.set("lang", "ja");
    window.location.assign(url.toString());
}

function redirectToHosted(path) {
    const url = new URL(`${config.cognitoDomain}/${path}`);
    url.searchParams.set("client_id", config.cognitoClientId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email phone");
    url.searchParams.set("lang", "ja");
    window.location.assign(url.toString());
}

document.getElementById("googleSignIn").addEventListener("click", redirectToGoogle);
document.getElementById("signUp").addEventListener("click", (event) => {
    event.preventDefault();
    redirectToHosted("signup");
});
document.getElementById("forgotPassword").addEventListener("click", (event) => {
    event.preventDefault();
    redirectToHosted("forgotPassword");
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    errorElement.hidden = true;
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) {
        showError("ユーザー名とパスワードを入力してください。");
        return;
    }
    submitButton.disabled = true;
    const user = new AmazonCognitoIdentity.CognitoUser({ Username: username, Pool: pool });
    user.authenticateUser(
        new AmazonCognitoIdentity.AuthenticationDetails({ Username: username, Password: password }),
        {
            onSuccess: (session) => {
                localStorage.setItem("id_token", session.getIdToken().getJwtToken());
                localStorage.setItem("access_token", session.getAccessToken().getJwtToken());
                localStorage.setItem("refresh_token", session.getRefreshToken().getToken());
                window.location.assign("index.html");
            },
            onFailure: (error) => {
                submitButton.disabled = false;
                showError(
                    error.code === "NotAuthorizedException"
                        ? "ユーザー名またはパスワードが正しくありません。"
                        : "ログインできませんでした。入力内容を確認してください。",
                );
            },
        },
    );
});
