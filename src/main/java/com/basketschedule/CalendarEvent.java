package com.basketschedule;

import java.time.LocalDateTime;

public class CalendarEvent {

    private LocalDateTime start;
    private LocalDateTime end;

    public CalendarEvent(LocalDateTime start, LocalDateTime end) {
        this.start = start;
        this.end = end;
    }

    public LocalDateTime getStart() {
        return start;
    }

    public LocalDateTime getEnd() {
        return end;
    }
}