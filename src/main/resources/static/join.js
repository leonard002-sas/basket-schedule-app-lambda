/* global AmazonCognitoIdentity */
const config = window.BasketScheduleConfig;
const pool = new AmazonCognitoIdentity.CognitoUserPool({
    UserPoolId: "ap-northeast-1_Cd5fxLwj3",
    ClientId: config.cognitoClientId,
});
const form = document.getElementById("joinForm");
const errorElement = document.getElementById("joinError");
let pendingRequest;
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
            error(
                signUpError.code === "UsernameExistsException"
                    ? "このユーザー名はすでに登録されています。"
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
