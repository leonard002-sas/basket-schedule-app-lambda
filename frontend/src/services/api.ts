import { config } from "../config";
import type {
    Announcement,
    AttendancePayload,
    Facility,
    Game,
    GameDetail,
    ImageJob,
    JoinRequest,
    ManagedUser,
    Player,
    PlayerStats,
    Profile,
    ProfileUpdate,
    Schedule,
    SchedulePayload,
    StatAction,
    Team,
} from "../types/domain";

export class ApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly code = "",
    ) {
        super(message);
    }
}
async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem("id_token");
    try {
        const response = await fetch(url, {
            ...init,
            headers: {
                ...(init.body ? { "Content-Type": "application/json" } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...init.headers,
            },
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok)
            throw new ApiError(
                body.message || `通信に失敗しました（${response.status}）`,
                response.status,
                body.code,
            );
        return body as T;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(
            "サーバーに接続できません。通信環境を確認して再試行してください。",
            0,
            "NETWORK_ERROR",
        );
    }
}
function queryUrl(base: string, params: Record<string, string | undefined>): string {
    const url = new URL(base);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") url.searchParams.set(key, value);
    });
    return url.toString();
}
function basketballUrl(resource: string, params: Record<string, string | undefined> = {}) {
    return queryUrl(config.apiUrl, { feature: "basketball", resource, ...params });
}
export const basketballRequest = <T>(resource: string, params: Record<string, string> = {}) =>
    request<T>(basketballUrl(resource, params));
export function unwrapItems<T>(response: { items?: T[] } | T[]): T[] {
    return Array.isArray(response) ? response : Array.isArray(response.items) ? response.items : [];
}
async function basketballItems<T>(
    resource: string,
    params: Record<string, string> = {},
): Promise<T[]> {
    const response = await basketballRequest<{ items?: T[] } | T[]>(resource, params);
    return unwrapItems(response);
}
export const basketballWrite = <T>(
    resource: string,
    method: "PUT" | "DELETE",
    body?: unknown,
    params: Record<string, string | undefined> = {},
) =>
    request<T>(basketballUrl(resource, params), {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

export async function fetchSchedules(): Promise<SchedulePayload> {
    const body = await request<Schedule[] | SchedulePayload>(config.apiUrl);
    return Array.isArray(body) ? { items: body, announcements: [] } : body;
}
export const fetchScheduleDetail = (s: Schedule) =>
    request<Schedule>(
        queryUrl(config.apiUrl, { scheduleMonth: s.scheduleMonth, startDateTime: s.startDateTime }),
    );
export const createSchedules = (schedules: unknown[]) =>
    request<{ message: string }>(config.scheduleRegisterApiUrl, {
        method: "POST",
        body: JSON.stringify({ schedules }),
    });
export const updateSchedule = (body: unknown) =>
    request<{ message: string }>(config.apiUrl, { method: "PUT", body: JSON.stringify(body) });
export const deleteSchedule = (s: Schedule) =>
    request<{ message: string }>(config.apiUrl, {
        method: "DELETE",
        body: JSON.stringify({ scheduleMonth: s.scheduleMonth, startDateTime: s.startDateTime }),
    });
export const fetchFacilities = () => request<Facility[]>(config.facilityApiUrl);
export const createFacility = (facility: Omit<Facility, "facilityId">) =>
    request<Facility>(config.facilityApiUrl, { method: "POST", body: JSON.stringify(facility) });
export const fetchAttendance = (s: Schedule) =>
    request<AttendancePayload>(
        queryUrl(config.apiUrl, {
            resource: "attendance",
            scheduleMonth: s.scheduleMonth,
            startDateTime: s.startDateTime,
        }),
    );
export const saveAttendance = (s: Schedule, status: string, guestCount = 0, comment = "") =>
    request<{ message: string; status: string }>(
        queryUrl(config.apiUrl, {
            resource: "attendance",
            scheduleMonth: s.scheduleMonth,
            startDateTime: s.startDateTime,
        }),
        { method: "PUT", body: JSON.stringify({ status, guestCount, comment }) },
    );
export const deleteAttendance = (s: Schedule) =>
    request<{ message: string }>(
        queryUrl(config.apiUrl, {
            resource: "attendance",
            scheduleMonth: s.scheduleMonth,
            startDateTime: s.startDateTime,
        }),
        { method: "DELETE" },
    );
export const saveAnnouncement = (body: Partial<Announcement>) =>
    request<Announcement>(queryUrl(config.apiUrl, { resource: "announcement" }), {
        method: "PUT",
        body: JSON.stringify(body),
    });
export const updateFacility = (facility: Facility) =>
    request<{ message: string }>(config.facilityApiUrl, {
        method: "PUT",
        body: JSON.stringify(facility),
    });
export const deleteFacility = (facilityId: string) =>
    request<{ message: string }>(config.facilityApiUrl, {
        method: "DELETE",
        body: JSON.stringify({ facilityId }),
    });
export const deleteAnnouncement = (id: string) =>
    request<{ message: string }>(queryUrl(config.apiUrl, { resource: "announcement", id }), {
        method: "DELETE",
    });
export const fetchProfile = () =>
    request<Profile>(queryUrl(config.apiUrl, { resource: "profile" }));
export const saveProfile = (body: ProfileUpdate) =>
    request<Profile>(queryUrl(config.apiUrl, { resource: "profile" }), {
        method: "PUT",
        body: JSON.stringify(body),
    });
export const fetchJoinRequests = () =>
    request<{ items: JoinRequest[] }>(queryUrl(config.apiUrl, { resource: "join-requests" }));
export const createJoinRequest = (body: Omit<JoinRequest, "createdAt">) =>
    request<{ message: string }>(queryUrl(config.apiUrl, { resource: "join-request" }), {
        method: "POST",
        body: JSON.stringify(body),
    });
export const requestImageUpload = (file: File) =>
    request<{ uploadUrl: string; fileName: string }>(config.uploadApiUrl, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
    });
export async function uploadImageToS3(uploadUrl: string, file: File): Promise<void> {
    const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
    });
    if (!response.ok) throw new ApiError("画像をアップロードできませんでした", response.status);
}
export const fetchImageJob = (jobId: string) =>
    request<ImageJob>(queryUrl(config.uploadApiUrl, { jobId }));

export const fetchTeams = () => basketballItems<Team>("teams");
export const saveTeam = (body: { teamId?: string; name: string }) =>
    basketballWrite<Team>("team", "PUT", body);
export const deleteTeam = (teamId: string) =>
    basketballWrite<{ message: string }>("team", "DELETE", undefined, { teamId });
export const fetchPlayers = (teamId: string) => basketballItems<Player>("players", { teamId });
export const savePlayer = (teamId: string, body: Partial<Player> & { name: string }) =>
    basketballWrite<Player>("player", "PUT", body, { teamId });
export const deletePlayer = (teamId: string, playerId: string) =>
    basketballWrite<{ message: string }>("player", "DELETE", undefined, { teamId, playerId });
export const fetchGames = (teamId: string) => basketballItems<Game>("games", { teamId });
export async function fetchGame(gameId: string): Promise<GameDetail> {
    type GameDetailResponse = Omit<GameDetail, "players" | "events"> & {
        players?: PlayerStats[] | { items?: PlayerStats[] };
        events?: Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> };
    };
    const response = await basketballRequest<GameDetailResponse>("game", { gameId });
    const players = Array.isArray(response.players)
        ? response.players
        : response.players?.items || [];
    const events = Array.isArray(response.events) ? response.events : response.events?.items || [];
    return { ...response, players, events };
}
export const saveGame = (teamId: string, body: Record<string, unknown>) =>
    basketballWrite<Game>("game", "PUT", body, { teamId });
export const importGame = (teamId: string, body: Record<string, unknown>) =>
    basketballWrite<Game>("import-game", "PUT", body, { teamId });
export const saveLineup = (gameId: string, playerIds: string[]) =>
    basketballWrite<{ message?: string }>("lineup", "PUT", { gameId, playerIds });
export const recordStat = (gameId: string, playerId: string, type: StatAction) =>
    basketballWrite<{ message?: string }>("action", "PUT", { gameId, playerId, type });
export const undoStat = (gameId: string) =>
    basketballWrite<{ message?: string }>("undo", "PUT", { gameId });
export const controlClock = (gameId: string, command: "start" | "pause" | "next" | "reset") =>
    basketballWrite<{ message?: string }>("clock", "PUT", { gameId, command });
export const finishGame = (gameId: string, opponentScore: number) =>
    basketballWrite<{ message?: string }>("finish", "PUT", { gameId, opponentScore });
export const fetchLeaderboard = (teamId: string, season: string) =>
    basketballItems<Record<string, string | number>>("leaderboard", { teamId, season });
export const fetchPlayerTrend = (teamId: string, playerId: string, season: string) =>
    basketballRequest<{ items: Record<string, string | number>[] }>("player-trend", {
        teamId,
        playerId,
        season,
    });
export const fetchUsers = () => basketballRequest<ManagedUser[]>("users");
export const updateUser = (username: string, action: string) =>
    basketballWrite<{ username: string }>("users", "PUT", { username, action });
export const approveUser = (username: string) =>
    basketballWrite<{ username: string }>("approve-user", "PUT", { username });
export const deleteUser = (username: string) =>
    basketballWrite<{ message: string }>("users", "DELETE", undefined, { username });
export const deleteOwnAccount = () => basketballWrite<{ message: string }>("account", "DELETE");
export const linkGoogleAccount = (googleIdToken: string) =>
    basketballWrite<{ message: string }>("account-link", "PUT", { googleIdToken });
