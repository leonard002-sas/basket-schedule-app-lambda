<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CognitoUser, CognitoUserAttribute, CognitoUserPool } from "amazon-cognito-identity-js";
import { config } from "../config";
import { createJoinRequest, saveProfile } from "../services/api";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const pool = new CognitoUserPool({
    UserPoolId: "ap-northeast-1_Cd5fxLwj3",
    ClientId: config.cognitoClientId,
});
const form = reactive({ displayName: "", email: "", username: "", password: "", message: "" });
const code = ref("");
const stage = ref<"form" | "code" | "complete">(route.query.google === "1" ? "form" : "form");
const busy = ref(false);
const error = ref("");
const googleFlow = computed(() => route.query.google === "1" && auth.isAuthenticated);

function readableError(cause: unknown): string {
    const value = cause as { code?: string; message?: string };
    if (value.code === "UsernameExistsException") return "このユーザー名はすでに登録されています。";
    if (value.code === "InvalidPasswordException")
        return "パスワードは大文字・小文字・数字・記号を含めてください。";
    if (value.code === "CodeMismatchException") return "確認コードが正しくありません。";
    if (value.code === "ExpiredCodeException") return "確認コードの有効期限が切れています。";
    return value.message || "登録できませんでした。入力内容を確認してください。";
}
function signUp(): Promise<void> {
    return new Promise((resolve, reject) => {
        const attributes = [new CognitoUserAttribute({ Name: "email", Value: form.email })];
        pool.signUp(form.username, form.password, attributes, [], (cause) =>
            cause ? reject(cause) : resolve(),
        );
    });
}
async function submit(): Promise<void> {
    error.value = "";
    busy.value = true;
    try {
        if (googleFlow.value) {
            const claims = auth.claims;
            await saveProfile({
                displayName: form.displayName,
                notificationOffsets: "NONE",
                joinRequest: true,
                message: form.message,
                email: claims?.email || "",
            });
            auth.clearSession();
            stage.value = "complete";
            return;
        }
        await signUp();
        await createJoinRequest({
            username: form.username,
            email: form.email,
            displayName: form.displayName,
            message: form.message,
        });
        stage.value = "code";
    } catch (cause) {
        error.value = readableError(cause);
    } finally {
        busy.value = false;
    }
}
async function confirmCode(): Promise<void> {
    busy.value = true;
    error.value = "";
    try {
        const user = new CognitoUser({ Username: form.username, Pool: pool });
        await new Promise<void>((resolve, reject) =>
            user.confirmRegistration(code.value.trim(), true, (cause) =>
                cause ? reject(cause) : resolve(),
            ),
        );
        stage.value = "complete";
    } catch (cause) {
        error.value = readableError(cause);
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <section class="join-page">
        <div class="join-intro">
            <RouterLink class="brand" to="/"
                ><span class="brand-mark">B</span
                ><span
                    ><strong>Basketball Team</strong><small>MEMBER WORKSPACE</small></span
                ></RouterLink
            >
            <span class="eyebrow">JOIN THE TEAM</span>
            <h1>チームへの<br />参加申請</h1>
            <p>
                表示名と連絡先を登録すると、管理者が申請内容を確認します。承認後に全機能を利用できます。
            </p>
            <ol>
                <li><b>01</b>アカウントを作成</li>
                <li><b>02</b>メールを確認</li>
                <li><b>03</b>管理者が承認</li>
            </ol>
        </div>
        <section class="join-card">
            <template v-if="stage === 'complete'">
                <span class="completion-mark">✓</span>
                <h2>申請を受け付けました</h2>
                <p>
                    管理者が確認して承認するまでお待ちください。承認されるとメールでお知らせします。
                </p>
                <button class="primary-button" type="button" @click="router.push('/')">
                    トップへ戻る
                </button>
            </template>
            <form v-else-if="stage === 'code'" @submit.prevent="confirmCode">
                <span class="eyebrow">VERIFY EMAIL</span>
                <h2>メールを確認</h2>
                <p>{{ form.email }} に届いた確認コードを入力してください。</p>
                <label
                    ><span>確認コード</span
                    ><input
                        v-model="code"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        required
                        autofocus
                /></label>
                <p v-if="error" class="form-error">{{ error }}</p>
                <button class="primary-button" :disabled="busy" type="submit">
                    {{ busy ? "確認中…" : "メールを確認" }}
                </button>
            </form>
            <form v-else @submit.prevent="submit">
                <span class="eyebrow">{{ googleFlow ? "GOOGLE PROFILE" : "CREATE ACCOUNT" }}</span>
                <h2>{{ googleFlow ? "プロフィールを設定" : "参加情報を入力" }}</h2>
                <label
                    ><span>表示名</span
                    ><input
                        v-model="form.displayName"
                        required
                        maxlength="40"
                        autocomplete="name"
                        placeholder="チーム内で表示する名前"
                /></label>
                <template v-if="!googleFlow"
                    ><label
                        ><span>メールアドレス</span
                        ><input
                            v-model="form.email"
                            type="email"
                            required
                            autocomplete="email" /></label
                    ><label
                        ><span>ユーザー名</span
                        ><input v-model="form.username" required autocomplete="username" /></label
                    ><label
                        ><span>パスワード</span
                        ><input
                            v-model="form.password"
                            type="password"
                            required
                            minlength="8"
                            autocomplete="new-password"
                        /><small>大文字・小文字・数字・記号を含む8文字以上</small></label
                    ></template
                >
                <label
                    ><span>管理者への一言（任意）</span
                    ><textarea v-model="form.message" maxlength="500" rows="4"></textarea>
                </label>
                <p v-if="error" class="form-error">{{ error }}</p>
                <button class="primary-button" :disabled="busy" type="submit">
                    {{ busy ? "申請中…" : "申請する" }}
                </button>
                <button
                    v-if="!googleFlow"
                    class="google-join"
                    type="button"
                    @click="auth.signupWithGoogle()"
                >
                    <b>G</b> Googleアカウントで作成
                </button>
            </form>
            <RouterLink v-if="stage !== 'complete'" class="text-link" to="/"
                >サインインへ戻る</RouterLink
            >
        </section>
    </section>
</template>
