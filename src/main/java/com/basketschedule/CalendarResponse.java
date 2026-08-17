package com.basketschedule;

import java.util.List;

public class CalendarResponse {

    private List<CalendarEntry> entries;

    public List<CalendarEntry> getEntries() {
        return entries;
    }

    public void setEntries(List<CalendarEntry> entries) {
        this.entries = entries;
    }
}