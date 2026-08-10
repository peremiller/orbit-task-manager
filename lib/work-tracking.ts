export const REQUIRED_WEEKLY_HOURS = 45;

export const WORKSTREAMS = [
  "Legal",
  "Ethics and Compliance",
  "Real Estate",
  "Audit and Risk",
  "Corporate Communications",
  "Shared Services",
  "Innovation",
  "Other",
] as const;

export const TASK_TYPES = [
  "Test",
  "Meeting - Internal",
  "Meeting - Client",
  "Administration",
  "Training",
  "PTO",
  "Innovation",
  "Other",
] as const;

export const FREQUENCIES = ["Recurring", "One-time delivery", "As needed"] as const;
export const PHASES = ["Planning", "Execution", "Test Reporting", "Program Testing", "Peer Review", "Internal Meeting", "DSU", "Leave", "Holiday", "Other"] as const;
export const APPLICATIONS = ["Archibus", "CyberGrants", "Corp Apps", "Legal", "NaveX", "LRN", "LandWorks", "Constellation", "Other"] as const;
export const LEAVE_TYPES = ["Vacation Leave", "Sick Leave", "Public Holiday", "Other Leave"] as const;
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const PHILIPPINE_HOLIDAYS_2026 = [
  { date: "2026-01-01", name: "New Year's Day", classification: "Regular holiday" },
  { date: "2026-02-17", name: "Chinese New Year", classification: "Special non-working day" },
  { date: "2026-03-20", name: "Eid'l Fitr", classification: "Regular holiday" },
  { date: "2026-04-02", name: "Maundy Thursday", classification: "Regular holiday" },
  { date: "2026-04-03", name: "Good Friday", classification: "Regular holiday" },
  { date: "2026-04-04", name: "Black Saturday", classification: "Special non-working day" },
  { date: "2026-04-09", name: "Araw ng Kagitingan", classification: "Regular holiday" },
  { date: "2026-05-01", name: "Labor Day", classification: "Regular holiday" },
  { date: "2026-05-27", name: "Eid'l Adha", classification: "Regular holiday" },
  { date: "2026-06-12", name: "Independence Day", classification: "Regular holiday" },
  { date: "2026-08-21", name: "Ninoy Aquino Day", classification: "Special non-working day" },
  { date: "2026-08-31", name: "National Heroes Day", classification: "Regular holiday" },
  { date: "2026-11-01", name: "All Saints' Day", classification: "Special non-working day" },
  { date: "2026-11-02", name: "All Souls' Day", classification: "Special non-working day" },
  { date: "2026-11-30", name: "Bonifacio Day", classification: "Regular holiday" },
  { date: "2026-12-08", name: "Feast of the Immaculate Conception", classification: "Special non-working day" },
  { date: "2026-12-24", name: "Christmas Eve", classification: "Special non-working day" },
  { date: "2026-12-25", name: "Christmas Day", classification: "Regular holiday" },
  { date: "2026-12-30", name: "Rizal Day", classification: "Regular holiday" },
  { date: "2026-12-31", name: "Last Day of the Year", classification: "Special non-working day" },
] as const;
const PHILIPPINE_HOLIDAY_SEED_VERSION = 2;

export type Workstream = string;
export type TaskType = string;
export type Frequency = string;

export type WorkTrackingOptions = {
  workstreams: string[];
  taskTypes: string[];
  phases: string[];
  applications: string[];
  frequencies: string[];
  leaveTypes: string[];
};

export type WorkOptionGroup = keyof WorkTrackingOptions;
export type ReportingPeriodMode = "weekly" | "fortnightly" | "sprint" | "monthly" | "quarterly";

export type SprintDefinition = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

export const DEFAULT_WORK_TRACKING_OPTIONS: WorkTrackingOptions = {
  workstreams: [...WORKSTREAMS],
  taskTypes: [...TASK_TYPES],
  phases: [...PHASES],
  applications: [...APPLICATIONS],
  frequencies: [...FREQUENCIES],
  leaveTypes: [...LEAVE_TYPES],
};

export type WorkItem = {
  id: string;
  orbitTaskId?: number;
  title: string;
  taskType: TaskType;
  workstream: Workstream;
  application: string;
  phase: string;
  frequency: Frequency;
  notes: string;
  plannedHoursByWeek: Record<string, number>;
};

export type ActualEntry = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  workItemId: string;
  holidayName?: string;
  details: string;
  testCaseCount: number;
  bugCount: number;
  entrySource: "actual" | "scheduled-advance" | "timesheet-source";
};

export type WorkTrackingState = {
  workItems: WorkItem[];
  actualEntries: ActualEntry[];
  selectedEffortWeeks: string[];
  timesheetWeek: string;
  sprints: SprintDefinition[];
  options: WorkTrackingOptions;
  timesheetOverrides: Record<string, number>;
  holidaySeedVersion: number;
};

export type TimesheetRow = {
  id: string;
  workItem: WorkItem;
  workItems: WorkItem[];
  hours: number[];
  total: number;
  excluded: boolean;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function localDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function localIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayIsoDate(now = new Date()) {
  return localIsoDate(now);
}

export function weekStartFromDate(value: string) {
  const candidate = ISO_DATE_PATTERN.test(value) ? localDate(value) : new Date();
  if (Number.isNaN(candidate.getTime())) return weekStartFromDate(todayIsoDate());
  const day = candidate.getDay();
  candidate.setDate(candidate.getDate() - (day === 0 ? 6 : day - 1));
  return localIsoDate(candidate);
}

export function addDays(value: string, amount: number) {
  const date = localDate(value);
  date.setDate(date.getDate() + amount);
  return localIsoDate(date);
}

export function maximumPlanningDate(now = new Date()) {
  return addDays(weekStartFromDate(todayIsoDate(now)), (52 * 7) + 6);
}

export function weekdayDates(weekStart: string) {
  const monday = weekStartFromDate(weekStart);
  return WEEKDAY_LABELS.map((_, index) => addDays(monday, index));
}

export function formatWeekRange(weekStart: string, locale?: string) {
  const start = localDate(weekStartFromDate(weekStart));
  const end = localDate(addDays(weekStartFromDate(weekStart), 6));
  const format = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" });
  return `${format.format(start)} – ${format.format(end)}`;
}

export function formatShortDate(value: string, locale?: string) {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(localDate(value));
}

export function sprintForDate(sprints: SprintDefinition[], value: string) {
  const date = ISO_DATE_PATTERN.test(value) ? value : todayIsoDate();
  return sprints.find((sprint) => sprint.startDate <= date && sprint.endDate >= date);
}

export function reportingWeeks(anchorDate: string, mode: ReportingPeriodMode, sprints: SprintDefinition[] = []) {
  const anchor = localDate(ISO_DATE_PATTERN.test(anchorDate) ? anchorDate : todayIsoDate());
  if (mode === "weekly") return [weekStartFromDate(localIsoDate(anchor))];
  if (mode === "fortnightly") {
    const first = weekStartFromDate(localIsoDate(anchor));
    return [first, addDays(first, 7)];
  }
  if (mode === "sprint") {
    const sprint = sprintForDate(sprints, localIsoDate(anchor));
    if (!sprint) return [weekStartFromDate(localIsoDate(anchor))];
    const firstWeek = weekStartFromDate(sprint.startDate);
    const lastWeek = weekStartFromDate(sprint.endDate);
    const weeks: string[] = [];
    for (let week = firstWeek; week <= lastWeek; week = addDays(week, 7)) weeks.push(week);
    return weeks;
  }
  const start = mode === "monthly"
    ? new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    : new Date(anchor.getFullYear(), Math.floor(anchor.getMonth() / 3) * 3, 1);
  const end = mode === "monthly"
    ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    : new Date(start.getFullYear(), start.getMonth() + 3, 0);
  const firstWeek = weekStartFromDate(localIsoDate(start));
  const lastWeek = weekStartFromDate(localIsoDate(end));
  const weeks: string[] = [];
  for (let week = firstWeek; week <= lastWeek; week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

export function formatReportingPeriod(anchorDate: string, mode: ReportingPeriodMode, locale?: string, sprints: SprintDefinition[] = []) {
  const anchor = localDate(ISO_DATE_PATTERN.test(anchorDate) ? anchorDate : todayIsoDate());
  if (mode === "weekly") return formatWeekRange(localIsoDate(anchor), locale);
  if (mode === "fortnightly") {
    const start = weekStartFromDate(localIsoDate(anchor));
    const format = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" });
    return `${format.format(localDate(start))} – ${format.format(localDate(addDays(start, 13)))}`;
  }
  if (mode === "sprint") {
    const sprint = sprintForDate(sprints, localIsoDate(anchor));
    if (!sprint) return "Select a configured sprint";
    const format = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" });
    return `${sprint.name} · ${format.format(localDate(sprint.startDate))} – ${format.format(localDate(sprint.endDate))}`;
  }
  if (mode === "monthly") return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(anchor);
  return `Q${Math.floor(anchor.getMonth() / 3) + 1} ${anchor.getFullYear()}`;
}

export function hoursBetween(startTime: string, endTime: string) {
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) return 0;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const minutes = ((endHour * 60) + endMinute) - ((startHour * 60) + startMinute);
  return minutes > 0 ? minutes / 60 : 0;
}

export function timesheetOverrideKey(weekStart: string, workItemId: string, date: string) {
  return `${weekStartFromDate(weekStart)}::${workItemId}::${date}`;
}

export function timesheetGroupId(workItem: Pick<WorkItem, "taskType" | "workstream" | "phase">) {
  return [workItem.taskType, workItem.workstream, workItem.phase]
    .map((value) => value.trim().toLocaleLowerCase())
    .join("::");
}

export function isInnovationWorkItem(item: WorkItem) {
  return item.workstream === "Innovation" || item.taskType === "Innovation";
}

export function entriesForWorkweek(state: WorkTrackingState, weekStart: string) {
  const dates = new Set(weekdayDates(weekStart));
  return state.actualEntries.filter((entry) => dates.has(entry.date));
}

export function actualHoursForWeek(state: WorkTrackingState, weekStart: string) {
  return entriesForWorkweek(state, weekStart).reduce((total, entry) => total + hoursBetween(entry.startTime, entry.endTime), 0);
}

export function eligibleActualHoursForWeek(state: WorkTrackingState, weekStart: string) {
  const workItems = new Map(state.workItems.map((item) => [item.id, item]));
  return entriesForWorkweek(state, weekStart).reduce((total, entry) => {
    const item = workItems.get(entry.workItemId);
    return total + (item && !isInnovationWorkItem(item) ? hoursBetween(entry.startTime, entry.endTime) : 0);
  }, 0);
}

export function plannedHoursForWeek(state: WorkTrackingState, weekStart: string) {
  const monday = weekStartFromDate(weekStart);
  return state.workItems.reduce((total, item) => total + (item.plannedHoursByWeek[monday] ?? 0), 0);
}

export function utilizedHoursForWeek(state: WorkTrackingState, weekStart: string) {
  const workItems = new Map(state.workItems.map((item) => [item.id, item]));
  return entriesForWorkweek(state, weekStart).reduce((total, entry) => {
    const item = workItems.get(entry.workItemId);
    const utilized = item?.taskType === "Test" && /planning|execution/i.test(item.phase);
    return total + (utilized ? hoursBetween(entry.startTime, entry.endTime) : 0);
  }, 0);
}

export function workItemActualHoursForWeek(state: WorkTrackingState, workItemId: string, weekStart: string) {
  return entriesForWorkweek(state, weekStart)
    .filter((entry) => entry.workItemId === workItemId)
    .reduce((total, entry) => total + hoursBetween(entry.startTime, entry.endTime), 0);
}

export function publicHolidayNamesForWorkItemWeek(state: WorkTrackingState, workItemId: string, weekStart: string) {
  return Array.from(new Set(entriesForWorkweek(state, weekStart)
    .filter((entry) => entry.workItemId === workItemId)
    .map((entry) => entry.holidayName?.trim())
    .filter((name): name is string => Boolean(name))));
}

export function workItemDisplayTitleForWeek(state: WorkTrackingState, workItem: WorkItem, weekStart: string) {
  const holidayNames = publicHolidayNamesForWorkItemWeek(state, workItem.id, weekStart);
  return holidayNames.length ? `${workItem.title} — ${holidayNames.join(", ")}` : workItem.title;
}

function quarterHourDistribution(values: number[], target: number) {
  if (target <= 0 || !values.some((value) => value > 0)) return values.map(() => 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const scaled = values.map((value) => (value / total) * target);
  const result = scaled.map((value) => Math.floor((value + Number.EPSILON) * 4) / 4);
  let unitsToAdd = Math.round((target - result.reduce((sum, value) => sum + value, 0)) * 4);
  const order = scaled
    .map((value, index) => ({ index, fraction: (value * 4) - Math.floor(value * 4), source: values[index] }))
    .filter((item) => item.source > 0)
    .sort((left, right) => right.fraction - left.fraction || right.source - left.source);
  for (let cursor = 0; unitsToAdd > 0 && order.length; cursor += 1, unitsToAdd -= 1) {
    result[order[cursor % order.length].index] += 0.25;
  }
  return result;
}

export function buildTimesheetRows(state: WorkTrackingState, weekStart: string): TimesheetRow[] {
  const dates = weekdayDates(weekStart);
  const entries = entriesForWorkweek(state, weekStart);
  const cells = state.workItems.map((workItem) => dates.map((date) => entries
    .filter((entry) => entry.workItemId === workItem.id && entry.date === date)
    .reduce((total, entry) => total + hoursBetween(entry.startTime, entry.endTime), 0)));
  const eligibleFlat = cells.flatMap((row, rowIndex) => isInnovationWorkItem(state.workItems[rowIndex]) ? row.map(() => 0) : row);
  const eligibleTotal = eligibleFlat.reduce((sum, value) => sum + value, 0);
  const reportedFlat = eligibleTotal >= REQUIRED_WEEKLY_HOURS
    ? quarterHourDistribution(eligibleFlat, REQUIRED_WEEKLY_HOURS)
    : eligibleFlat;
  let cursor = 0;

  const sourceRows = state.workItems
    .map((workItem, rowIndex) => {
      const excluded = isInnovationWorkItem(workItem);
      const hours = cells[rowIndex].map((actual) => {
        const reported = reportedFlat[cursor];
        cursor += 1;
        return excluded ? actual : reported;
      });
      const finalHours = hours.map((value, dayIndex) => {
        if (excluded) return value;
        const override = state.timesheetOverrides[timesheetOverrideKey(weekStart, workItem.id, dates[dayIndex])];
        return Number.isFinite(override) ? override : value;
      });
      return { id: workItem.id, workItem, workItems: [workItem], hours: finalHours, total: finalHours.reduce((sum, value) => sum + value, 0), excluded };
    })
    .filter((row) => row.total > 0 || (row.workItem.plannedHoursByWeek[weekStartFromDate(weekStart)] ?? 0) > 0);

  const grouped = new Map<string, TimesheetRow>();
  sourceRows.forEach((row) => {
    const id = timesheetGroupId(row.workItem);
    const current = grouped.get(id);
    if (!current) {
      grouped.set(id, { ...row, id });
      return;
    }
    current.workItems.push(row.workItem);
    current.hours = current.hours.map((value, index) => value + row.hours[index]);
    current.total += row.total;
  });

  return Array.from(grouped.values()).map((row) => {
    const hours = row.hours.map((value, dayIndex) => {
      const override = state.timesheetOverrides[timesheetOverrideKey(weekStart, row.id, dates[dayIndex])];
      return !row.excluded && Number.isFinite(override) ? override : value;
    });
    return { ...row, hours, total: hours.reduce((sum, value) => sum + value, 0) };
  });
}

export function createDefaultWorkTrackingState(now = new Date()): WorkTrackingState {
  const week = weekStartFromDate(localIsoDate(now));
  const holidayPlannedHours = PHILIPPINE_HOLIDAYS_2026.reduce<Record<string, number>>((hoursByWeek, holiday) => {
    const holidayWeek = weekStartFromDate(holiday.date);
    hoursByWeek[holidayWeek] = (hoursByWeek[holidayWeek] ?? 0) + 9;
    return hoursByWeek;
  }, {});
  const holidayWorkItem: WorkItem = {
    id: "work-ph-public-holiday-2026",
    title: "Public Holiday",
    taskType: "PTO",
    workstream: "Shared Services",
    application: "",
    phase: "Holiday",
    frequency: "As needed",
    notes: "Official Philippine national holidays for 2026.",
    plannedHoursByWeek: holidayPlannedHours,
  };
  return {
    workItems: [holidayWorkItem],
    actualEntries: PHILIPPINE_HOLIDAYS_2026.map((holiday) => ({
      id: `holiday-ph-${holiday.date}`,
      date: holiday.date,
      startTime: "08:00",
      endTime: "17:00",
      workItemId: holidayWorkItem.id,
      holidayName: holiday.name,
      details: `${holiday.name} · Philippines · ${holiday.classification}`,
      testCaseCount: 0,
      bugCount: 0,
      entrySource: "scheduled-advance" as const,
    })),
    selectedEffortWeeks: [week],
    timesheetWeek: week,
    sprints: [{ id: "sprint-default", name: "Sprint 1", startDate: week, endDate: addDays(week, 13) }],
    options: Object.fromEntries(Object.entries(DEFAULT_WORK_TRACKING_OPTIONS).map(([group, values]) => [group, [...values]])) as WorkTrackingOptions,
    timesheetOverrides: {},
    holidaySeedVersion: PHILIPPINE_HOLIDAY_SEED_VERSION,
  };
}

function cleanText(value: unknown, maximum = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function normalizeWorkItem(value: unknown): WorkItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<WorkItem>;
  const id = cleanText(item.id, 100);
  const title = cleanText(item.title, 300);
  if (!id || !title) return null;
  const plannedHoursByWeek = Object.fromEntries(Object.entries(item.plannedHoursByWeek ?? {})
    .filter(([week, hours]) => ISO_DATE_PATTERN.test(week) && Number.isFinite(Number(hours)) && Number(hours) >= 0 && Number(hours) <= 168)
    .map(([week, hours]) => [weekStartFromDate(week), Math.round(Number(hours) * 100) / 100]));
  return {
    id,
    orbitTaskId: Number.isSafeInteger(item.orbitTaskId) ? item.orbitTaskId : undefined,
    title,
    taskType: cleanText(item.taskType, 100) || "Other",
    workstream: cleanText(item.workstream, 100) || "Other",
    application: cleanText(item.application, 200),
    phase: cleanText(item.phase, 200),
    frequency: cleanText(item.frequency, 100) || "As needed",
    notes: cleanText(item.notes, 2000),
    plannedHoursByWeek,
  };
}

function normalizeActualEntry(value: unknown): ActualEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<ActualEntry>;
  const id = cleanText(entry.id, 100);
  const workItemId = cleanText(entry.workItemId, 100);
  if (!id || !workItemId || !ISO_DATE_PATTERN.test(entry.date ?? "") || !TIME_PATTERN.test(entry.startTime ?? "") || !TIME_PATTERN.test(entry.endTime ?? "")) return null;
  if (hoursBetween(entry.startTime!, entry.endTime!) <= 0) return null;
  return {
    id,
    date: entry.date!,
    startTime: entry.startTime!,
    endTime: entry.endTime!,
    workItemId,
    holidayName: cleanText(entry.holidayName, 300) || undefined,
    details: cleanText(entry.details, 2000),
    testCaseCount: Number.isSafeInteger(Number(entry.testCaseCount)) && Number(entry.testCaseCount) >= 0 ? Math.min(Number(entry.testCaseCount), 100_000) : 0,
    bugCount: Number.isSafeInteger(Number(entry.bugCount)) && Number(entry.bugCount) >= 0 ? Math.min(Number(entry.bugCount), 100_000) : 0,
    entrySource: entry.entrySource === "scheduled-advance" || entry.entrySource === "timesheet-source" ? entry.entrySource : "actual",
  };
}

function normalizeSprint(value: unknown): SprintDefinition | null {
  if (!value || typeof value !== "object") return null;
  const sprint = value as Partial<SprintDefinition>;
  const id = cleanText(sprint.id, 100);
  const name = cleanText(sprint.name, 200);
  const startDate = cleanText(sprint.startDate, 10);
  const endDate = cleanText(sprint.endDate, 10);
  if (!id || !name || !ISO_DATE_PATTERN.test(startDate) || !ISO_DATE_PATTERN.test(endDate) || startDate > endDate) return null;
  return { id, name, startDate, endDate };
}

export function normalizeWorkTracking(value: unknown, now = new Date()): WorkTrackingState {
  const fallback = createDefaultWorkTrackingState(now);
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<WorkTrackingState>;
  let workItems = Array.isArray(candidate.workItems) ? candidate.workItems.map(normalizeWorkItem).filter((item): item is WorkItem => Boolean(item)).slice(0, 1_000) : [];
  const itemIds = new Set(workItems.map((item) => item.id));
  let actualEntries = Array.isArray(candidate.actualEntries)
    ? candidate.actualEntries.map(normalizeActualEntry).filter((entry): entry is ActualEntry => entry !== null).filter((entry) => itemIds.has(entry.workItemId)).slice(0, 5_000)
    : [];
  const candidateHolidaySeedVersion = Number.isSafeInteger(Number(candidate.holidaySeedVersion)) ? Number(candidate.holidaySeedVersion) : 0;
  if (candidateHolidaySeedVersion < 1) {
    const defaultHolidayItem = fallback.workItems[0];
    let holidayItem = workItems.find((item) => item.taskType === "PTO" && item.phase === "Holiday" && item.title === "Public Holiday");
    if (!holidayItem) {
      holidayItem = { ...defaultHolidayItem, plannedHoursByWeek: {} };
      workItems = [...workItems, holidayItem];
    }
    const plannedHoursByWeek = { ...holidayItem.plannedHoursByWeek };
    const additions = fallback.actualEntries.filter((seedEntry) => !actualEntries.some((entry) => entry.date === seedEntry.date && workItems.find((item) => item.id === entry.workItemId)?.title === "Public Holiday"));
    additions.forEach((entry) => {
      const holidayWeek = weekStartFromDate(entry.date);
      plannedHoursByWeek[holidayWeek] = (plannedHoursByWeek[holidayWeek] ?? 0) + hoursBetween(entry.startTime, entry.endTime);
    });
    workItems = workItems.map((item) => item.id === holidayItem.id ? { ...item, plannedHoursByWeek } : item);
    actualEntries = [...actualEntries, ...additions.map((entry) => ({ ...entry, workItemId: holidayItem!.id }))].slice(0, 5_000);
  }
  if (candidateHolidaySeedVersion < 2) {
    const officialHolidayNames = new Map<string, string>(PHILIPPINE_HOLIDAYS_2026.map((holiday) => [holiday.date, holiday.name]));
    const workItemById = new Map(workItems.map((item) => [item.id, item]));
    actualEntries = actualEntries.map((entry) => {
      const item = workItemById.get(entry.workItemId);
      const holidayName = officialHolidayNames.get(entry.date);
      return holidayName && item?.taskType === "PTO" && item.phase === "Holiday"
        ? { ...entry, holidayName: entry.holidayName || holidayName }
        : entry;
    });
  }
  const selectedEffortWeeks = Array.isArray(candidate.selectedEffortWeeks)
    ? Array.from(new Set(candidate.selectedEffortWeeks.filter((week): week is string => typeof week === "string" && ISO_DATE_PATTERN.test(week)).map(weekStartFromDate))).slice(0, 60)
    : [];
  const timesheetWeek = typeof candidate.timesheetWeek === "string" && ISO_DATE_PATTERN.test(candidate.timesheetWeek)
    ? weekStartFromDate(candidate.timesheetWeek)
    : fallback.timesheetWeek;
  const sprints = Array.isArray(candidate.sprints)
    ? Array.from(new Map(candidate.sprints
      .map(normalizeSprint)
      .filter((sprint): sprint is SprintDefinition => Boolean(sprint))
      .map((sprint) => [sprint.id, sprint])).values())
      .sort((left, right) => left.startDate.localeCompare(right.startDate))
      .slice(0, 200)
    : fallback.sprints;
  const configuredOptions = candidate.options && typeof candidate.options === "object" ? candidate.options as Partial<WorkTrackingOptions> : {};
  const normalizeOptionList = (value: unknown, defaultValues: string[], usedValues: string[]) => {
    const candidateValues = Array.isArray(value)
      ? value.map((option) => cleanText(option, 100)).filter(Boolean).slice(0, 100)
      : defaultValues;
    const configured = candidateValues.length ? candidateValues : defaultValues;
    const combined = [...configured, ...usedValues.map((option) => cleanText(option, 100)).filter(Boolean)];
    return Array.from(new Map(combined.map((option) => [option.toLocaleLowerCase(), option])).values()).slice(0, 100);
  };
  const options: WorkTrackingOptions = {
    workstreams: normalizeOptionList(configuredOptions.workstreams, fallback.options.workstreams, workItems.map((item) => item.workstream)),
    taskTypes: normalizeOptionList(configuredOptions.taskTypes, fallback.options.taskTypes, workItems.map((item) => item.taskType)),
    phases: normalizeOptionList(configuredOptions.phases, fallback.options.phases, workItems.map((item) => item.phase)),
    applications: normalizeOptionList(configuredOptions.applications, fallback.options.applications, workItems.map((item) => item.application)),
    frequencies: normalizeOptionList(configuredOptions.frequencies, fallback.options.frequencies, workItems.map((item) => item.frequency)),
    leaveTypes: normalizeOptionList(configuredOptions.leaveTypes, fallback.options.leaveTypes, workItems.filter((item) => item.taskType === "PTO" || item.taskType === "Holiday").map((item) => item.title)),
  };
  const timesheetOverrides = candidate.timesheetOverrides && typeof candidate.timesheetOverrides === "object"
    ? Object.fromEntries(Object.entries(candidate.timesheetOverrides)
      .filter(([key, hours]) => key.length <= 500 && Number.isFinite(Number(hours)) && Number(hours) >= 0 && Number(hours) <= 24)
      .slice(0, 5_000)
      .map(([key, hours]) => [key, Math.round(Number(hours) * 4) / 4]))
    : {};
  return { workItems, actualEntries, selectedEffortWeeks: selectedEffortWeeks.length ? selectedEffortWeeks : fallback.selectedEffortWeeks, timesheetWeek, sprints, options, timesheetOverrides, holidaySeedVersion: PHILIPPINE_HOLIDAY_SEED_VERSION };
}

export function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}
