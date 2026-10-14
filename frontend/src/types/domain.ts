export type EventType = "PRACTICE" | "GAME" | "MEETING";
export type AttendanceStatus = "ATTENDING" | "MAYBE" | "ABSENT";
export type NotificationOffset = "NONE" | "DAY_BEFORE" | "HOUR_BEFORE" | "BOTH";

export interface Schedule {
    scheduleMonth: string;
    startDateTime: string;
    endDateTime: string;
    eventType: EventType;
    facilityId?: string;
    facilityName?: string;
    address?: string;
    url?: string;
    note?: string;
    competitionName?: string;
    round?: string;
    videoUrl?: string;
    videoTags?: string;
    attendanceTotal?: number;
    attendanceMaybe?: number;
    attendanceAbsent?: number;
    attendanceGuests?: number;
}
export interface Announcement {
    id: string;
    title: string;
    content: string;
    urgency: "NORMAL" | "IMPORTANT" | "URGENT";
    visibleUntil: string;
    visible: boolean;
}
export interface SchedulePayload {
    items: Schedule[];
    announcements: Announcement[];
}
export interface Facility {
    facilityId: string;
    facilityName: string;
    address?: string;
    url?: string;
    note?: string;
    enabled?: boolean;
}
export interface AttendanceMember {
    userSub?: string;
    username?: string;
    displayName?: string;
    status: AttendanceStatus;
    comment?: string;
    guestCount?: number;
}
export interface AttendancePayload {
    attending?: number;
    maybe?: number;
    absent?: number;
    guests?: number;
    total?: number;
    currentStatus?: AttendanceStatus;
    currentComment?: string;
    currentGuestCount?: number;
    participants?: AttendanceMember[];
}
export interface Profile {
    displayName: string;
    notificationOffsets: NotificationOffset;
}
export interface ProfileUpdate extends Profile {
    joinRequest?: boolean;
    message?: string;
    email?: string;
}
export interface JoinRequest {
    username: string;
    email: string;
    displayName: string;
    message?: string;
    createdAt?: string;
}
export interface Team {
    teamId: string;
    name: string;
}
export interface Player {
    playerId: string;
    name: string;
    number?: number;
    position?: string;
    active?: boolean;
}
export interface PlayerStats extends Player {
    points?: number;
    PTS?: number;
    FGM?: number;
    FGA?: number;
    FG2M?: number;
    FG2A?: number;
    FG3M?: number;
    FG3A?: number;
    FTM?: number;
    FTA?: number;
    OREB?: number;
    DREB?: number;
    REB?: number;
    AST?: number;
    STL?: number;
    BLK?: number;
    TO?: number;
    PF?: number;
    minutes?: number;
    participation?: string;
}
export interface Game {
    gameId: string;
    date: string;
    opponent: string;
    status: "READY" | "LIVE" | "FINAL";
    teamScore?: number;
    opponentScore?: number;
    result?: "W" | "L" | "D" | "U";
    competitionName?: string;
    round?: string;
    quarterMinutes?: number;
    period?: number;
    remainingSeconds?: number;
    clockRunning?: boolean;
    clockStartedAt?: string;
    onCourt?: string[] | string;
    rosterPlayerIds?: string[];
    scheduleMonth?: string;
    startDateTime?: string;
}
export interface GameDetail extends Game {
    players: PlayerStats[];
    events: Array<Record<string, unknown>>;
}
export type StatAction =
    | "FG2_MADE"
    | "FG2_MISS"
    | "FG3_MADE"
    | "FG3_MISS"
    | "FT_MADE"
    | "FT_MISS"
    | "OREB"
    | "DREB"
    | "AST"
    | "STL"
    | "BLK"
    | "TO"
    | "PF";
export interface ManagedUser {
    username: string;
    sub: string;
    email: string;
    enabled: boolean;
    status: string;
    role: "root-admin" | "admin" | "member";
    emailVerified: boolean;
    createdAt: string;
}
export interface ImageJob {
    jobId: string;
    fileName: string;
    status: string;
    stage?: string;
    completed?: number;
    total?: number;
    message?: string;
}
