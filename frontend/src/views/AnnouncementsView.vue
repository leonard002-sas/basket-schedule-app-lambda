<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { deleteAnnouncement, saveAnnouncement } from "../services/api";
import { useScheduleStore } from "../stores/schedules";
import type { Announcement } from "../types/domain";
const store = useScheduleStore();
const message = ref("");
const form = reactive<{
    id: string;
    title: string;
    content: string;
    urgency: Announcement["urgency"];
    visibleUntil: string;
}>({
    id: "",
    title: "",
    content: "",
    urgency: "NORMAL",
    visibleUntil: new Date(Date.now() + 7 * 86400000).toLocaleDateString("sv-SE"),
});
async function submit(): Promise<void> {
    message.value = "保存しています…";
    try {
        await saveAnnouncement(form);
        Object.assign(form, { id: "", title: "", content: "", urgency: "NORMAL" });
        await store.load(true);
        message.value = "保存しました。";
    } catch (e) {
        message.value = e instanceof Error ? e.message : "保存できません";
    }
}
function edit(item: (typeof store.announcements)[number]): void {
    Object.assign(form, item);
    window.scrollTo({ top: 0, behavior: "smooth" });
}
async function remove(id: string): Promise<void> {
    if (!confirm("この周知を削除しますか？")) return;
    await deleteAnnouncement(id);
    await store.load(true);
}
onMounted(() => store.load());
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">ANNOUNCEMENTS</span>
                <h1>周知事項</h1>
                <p>重要度と表示期限を設定して、チームへ伝えます。</p>
            </div>
        </header>
        <div class="two-column">
            <form class="form-card" @submit.prevent="submit">
                <h2>{{ form.id ? "周知を編集" : "新しい周知" }}</h2>
                <label><span>タイトル</span><input v-model="form.title" required /></label
                ><label
                    ><span>内容</span><textarea v-model="form.content" rows="7" required></textarea>
                </label>
                <div class="form-grid">
                    <label
                        ><span>重要度</span
                        ><select v-model="form.urgency">
                            <option value="NORMAL">通常</option>
                            <option value="IMPORTANT">重要</option>
                            <option value="URGENT">緊急</option>
                        </select></label
                    ><label
                        ><span>表示期限</span
                        ><input v-model="form.visibleUntil" type="date" required
                    /></label>
                </div>
                <div class="form-footer">
                    <p>{{ message }}</p>
                    <button class="primary-button" type="submit">保存</button>
                </div>
            </form>
            <section class="content-card">
                <h2>登録済み</h2>
                <article
                    v-for="item in store.announcements"
                    :key="item.id"
                    class="notice-card"
                    :class="item.urgency.toLowerCase()"
                >
                    <div>
                        <span>{{ item.urgency }}</span
                        ><small>{{ item.visibleUntil }}まで</small>
                    </div>
                    <h3>{{ item.title }}</h3>
                    <p>{{ item.content }}</p>
                    <footer>
                        <button type="button" @click="edit(item)">編集</button
                        ><button type="button" @click="remove(item.id)">削除</button>
                    </footer>
                </article>
            </section>
        </div>
    </section>
</template>
