package com.basketschedule;

import java.util.ArrayList;
import java.util.List;

public class CalendarResponse {

	private String scheduleMonth;

	private List<CalendarEntry> entries = new ArrayList<>();

	public String getScheduleMonth() {

		return scheduleMonth;

	}

	public void setScheduleMonth(String scheduleMonth) {

		this.scheduleMonth = scheduleMonth;

	}

	public List<CalendarEntry> getEntries() {

		return entries;

	}

	public void setEntries(List<CalendarEntry> entries) {

		this.entries = entries;

	}

}