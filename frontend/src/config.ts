const productionOrigin = "https://d13o4oynf3jxlu.cloudfront.net";
const browserOrigin = typeof window === "undefined" ? productionOrigin : window.location.origin;

export const config = Object.freeze({
    apiUrl: "https://7yxh3p2c5swyx6ajv45ldmiswe0tirop.lambda-url.ap-northeast-1.on.aws/",
    uploadApiUrl: "https://gg5d4xxwdpfjdesh2n5vyxqm5q0mnwii.lambda-url.ap-northeast-1.on.aws/",
    facilityApiUrl: "https://wybpjskbmgh6jbra4647ethnhm0pkulf.lambda-url.ap-northeast-1.on.aws/",
    scheduleRegisterApiUrl:
        "https://z7gedcbjogrjl7ld4o6rcj7dte0cjklf.lambda-url.ap-northeast-1.on.aws/",
    cognitoDomain: "https://ap-northeast-1cd5fxlwj3.auth.ap-northeast-1.amazoncognito.com",
    cognitoClientId: "3mr9ep2rosop9ratlg1l3bta70",
    redirectUri: `${browserOrigin}/app/`,
    logoutUri: `${browserOrigin}/app/`,
});
