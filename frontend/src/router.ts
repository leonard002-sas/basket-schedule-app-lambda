import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

interface TokenClaims {
    exp?: number;
    "cognito:groups"?: string[];
}

function readCurrentClaims(): TokenClaims | null {
    const token = localStorage.getItem("id_token");
    if (!token) return null;
    try {
        const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const claims = JSON.parse(
            atob(payload + "=".repeat((4 - (payload.length % 4)) % 4)),
        ) as TokenClaims;
        if (!claims.exp || claims.exp * 1000 <= Date.now()) {
            ["id_token", "access_token", "refresh_token"].forEach((key) =>
                localStorage.removeItem(key),
            );
            return null;
        }
        return claims;
    } catch {
        return null;
    }
}

const routes: RouteRecordRaw[] = [
    { path: "/", name: "home", component: () => import("./views/HomeView.vue") },
    { path: "/join", name: "join", component: () => import("./views/JoinView.vue") },
    { path: "/calendar", name: "calendar", component: () => import("./views/CalendarView.vue") },
    {
        path: "/schedules/new",
        name: "schedule-new",
        component: () => import("./views/ScheduleFormView.vue"),
        meta: { admin: true },
    },
    {
        path: "/facilities",
        name: "facilities",
        component: () => import("./views/FacilitiesView.vue"),
        meta: { admin: true },
    },
    {
        path: "/announcements",
        name: "announcements",
        component: () => import("./views/AnnouncementsView.vue"),
        meta: { admin: true },
    },
    { path: "/videos", name: "videos", component: () => import("./views/VideosView.vue") },
    { path: "/teams", name: "teams", component: () => import("./views/TeamsView.vue") },
    { path: "/games", name: "games", component: () => import("./views/GamesView.vue") },
    {
        path: "/games/:gameId",
        name: "game-score",
        component: () => import("./views/GameScoreView.vue"),
    },
    { path: "/rankings", name: "rankings", component: () => import("./views/RankingsView.vue") },
    {
        path: "/users",
        name: "users",
        component: () => import("./views/UsersView.vue"),
        meta: { admin: true },
    },
    { path: "/account", name: "account", component: () => import("./views/AccountView.vue") },
    { path: "/:pathMatch(.*)*", redirect: "/" },
];

// CloudFront/S3側のパス書き換えを増やさず、直接再読み込みにも対応します。
const router = createRouter({
    history: createWebHashHistory("/app/"),
    routes,
    scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach((to) => {
    const claims = readCurrentClaims();
    if (!claims && !["home", "join"].includes(String(to.name))) {
        return { name: "home", query: { login: "required" } };
    }
    if (to.meta.admin && claims) {
        const groups = claims["cognito:groups"] ?? [];
        if (!groups.some((group) => ["admins", "root-admins"].includes(group))) {
            return { name: "calendar" };
        }
    }
});

export default router;
