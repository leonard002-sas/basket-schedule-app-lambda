import { config } from "../config";
import type {
    Announcement,
    AttendancePayload,
    Facility,
    Game,
    ManagedUser,
    Player,
    Schedule,
    SchedulePayload,
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
    const response = await fetch(url, {
        ...init,
        headers: {
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...init.headers,
        },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new ApiError(
            body.message || `通信に失敗しました（${response.status}）`,
            response.status,
            body.code,
        );
    }
    return body as T;
}

function queryUrl(base: string, params: Record<string, string | undefined>): string {
    const url = new URL(base);
    Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
    });
    return url.toString();
}

export async function fetchSchedules(): Promise<SchedulePayload> {
    const body = await request<Schedule[] | SchedulePayload>(config.apiUrl);
    return Array.isArray(body) ? { items: body, announcements: [] } : body;
}

export const fetchFacilities = () => request<Facility[]>(config.facilityApiUrl);

export const createFacility = (facility: Omit<Facility, "facilityId">) =>
    request<Facility>(config.facilityApiUrl, { method: "POST", body: JSON.stringify(facility) });

export const createSchedules = (schedules: unknown[]) =>
    request<{ message: string }>(config.scheduleRegisterApiUrl, {
        method: "POST",
        body: JSON.stringify({ schedules }),
    });

export const fetchAttendance = (schedule: Schedule) =>
    request<AttendancePayload>(
        queryUrl(config.apiUrl, {
            resource: "attendance",
            scheduleMonth: schedule.scheduleMonth,
            startDateTime: schedule.startDateTime,
        }),
    );

export const saveAttendance = (
    schedule: Schedule,
    status: string,
    guests: number,
    displayName?: string,
) =>
    request<AttendancePayload>(queryUrl(config.apiUrl, { resource: "attendance" }), {
        method: "PUT",
        body: JSON.stringify({
            scheduleMonth: schedule.scheduleMonth,
            startDateTime: schedule.startDateTime,
            status,
            guests,
            displayName,
        }),
    });

export const saveAnnouncement = (announcement: Partial<Announcement>) =>
    request<Announcement>(queryUrl(config.apiUrl, { resource: "announcement" }), {
        method: "PUT",
        body: JSON.stringify(announcement),
    });

export const deleteAnnouncement = (id: string) =>
    request<{ message: string }>(queryUrl(config.apiUrl, { resource: "announcement", id }), {
        method: "DELETE",
    });

export const basketballRequest = <T>(resource: string, params: Record<string, string> = {}) =>
    request<T>(queryUrl(config.apiUrl, { feature: "basketball", resource, ...params }));

export const fetchTeams = () => basketballRequest<Team[]>("teams");
export const fetchPlayers = (teamId: string) => basketballRequest<Player[]>("players", { teamId });
export const fetchGames = (teamId: string) => basketballRequest<Game[]>("games", { teamId });
export const fetchLeaderboard = (teamId: string, season: string) =>
    basketballRequest<Record<string, string | number>[]>("leaderboard", { teamId, season });
export const fetchUsers = () => basketballRequest<ManagedUser[]>("users");

export const updateUser = (username: string, action: string) =>
    request<{ username: string }>(
        queryUrl(config.apiUrl, { feature: "basketball", resource: "users" }),
        {
            method: "PUT",
            body: JSON.stringify({ username, action }),
        },
    );
