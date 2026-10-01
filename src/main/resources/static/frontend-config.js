/**
 * 公開フロントエンドが利用する接続先を一か所で管理します。
 *
 * ここに含まれる値は Cognito の公開クライアントIDやLambda Function URLです。
 * Gemini APIキーなどの秘密情報は絶対に静的ファイルへ置かず、Lambdaの環境変数で管理します。
 */
window.BasketScheduleConfig = Object.freeze({
    apiUrl: "https://7yxh3p2c5swyx6ajv45ldmiswe0tirop.lambda-url.ap-northeast-1.on.aws/",
    uploadApiUrl: "https://gg5d4xxwdpfjdesh2n5vyxqm5q0mnwii.lambda-url.ap-northeast-1.on.aws/",
    facilityApiUrl: "https://wybpjskbmgh6jbra4647ethnhm0pkulf.lambda-url.ap-northeast-1.on.aws/",
    scheduleRegisterApiUrl:
        "https://z7gedcbjogrjl7ld4o6rcj7dte0cjklf.lambda-url.ap-northeast-1.on.aws/",
    cognitoDomain: "https://ap-northeast-1cd5fxlwj3.auth.ap-northeast-1.amazoncognito.com",
    cognitoClientId: "3mr9ep2rosop9ratlg1l3bta70",
    redirectUri: "https://d13o4oynf3jxlu.cloudfront.net",
});
