export type EventType = "PRACTICE" | "GAME" | "MEETING";
export type AttendanceStatus = "ATTENDING" | "MAYBE" | "ABSENT";

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
    subject?: string;
    displayName: string;
    status: AttendanceStatus;
    guests?: number;
}

export interface AttendancePayload {
    status?: AttendanceStatus;
    guests?: number;
    members?: AttendanceMember[];
    attending?: number;
    maybe?: number;
    absent?: number;
    totalGuests?: number;
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

export interface Game {
    gameId: string;
    date: string;
    opponent: string;
    status: "DRAFT" | "LIVE" | "FINAL";
    teamScore?: number;
    opponentScore?: number;
    result?: "W" | "L" | "D" | "U";
    competitionName?: string;
    round?: string;
}

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
