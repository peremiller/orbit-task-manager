import type { Cell, Row, Worksheet } from "exceljs";
import {
  REQUIRED_WEEKLY_HOURS,
  addDays,
  actualHoursForWeek,
  buildTimesheetRows,
  eligibleActualHoursForWeek,
  entriesForWorkweek,
  formatWeekRange,
  hoursBetween,
  isInnovationWorkItem,
  plannedHoursForWeek,
  timesheetOverrideKey,
  weekdayDates,
  weekStartFromDate,
  workItemActualHoursForWeek,
  type WorkItem,
  type WorkTrackingState,
} from "./work-tracking";

const BLUE = "2457FF";
const NAVY = "172554";
const PURPLE = "7E3AAF";
const PALE_BLUE = "E9EEFF";
const PALE_PURPLE = "F1E8FF";
const PALE_GREEN = "EAF9F1";
const PALE_AMBER = "FFF4D6";
const WHITE = "FFFFFF";
const INK = "111318";
const MUTED = "667085";
const LINE = "DDE1E7";

type ExportOptions = {
  state: WorkTrackingState;
  weeks: string[];
  personName: string;
};

function dateValue(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function timeValue(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return ((hours * 60) + minutes) / 1_440;
}

function columnLetter(index: number) {
  let result = "";
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}

function formula(cell: Cell, expression: string, result: string | number | boolean | Date) {
  cell.value = { formula: expression.replace(/^=/, ""), result };
  cell.font = { color: { argb: BLUE } };
}

function thinBorder() {
  return {
    top: { style: "thin" as const, color: { argb: LINE } },
    left: { style: "thin" as const, color: { argb: LINE } },
    bottom: { style: "thin" as const, color: { argb: LINE } },
    right: { style: "thin" as const, color: { argb: LINE } },
  };
}

function styleTitle(sheet: Worksheet, title: string, personName: string, week: string, lastColumn: number) {
  const end = columnLetter(lastColumn);
  sheet.mergeCells(`A1:${end}1`);
  const titleCell = sheet.getCell("A1");
  titleCell.value = title;
  titleCell.font = { bold: true, size: 18, color: { argb: WHITE } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 30;
  sheet.getCell("A2").value = "Person / application user";
  sheet.getCell("B2").value = personName;
  sheet.getCell("A3").value = "Workbook week";
  sheet.getCell("B3").value = dateValue(week);
  sheet.getCell("B3").numFmt = "mmm d, yyyy";
  sheet.getCell("C3").value = dateValue(addDays(week, 6));
  sheet.getCell("C3").numFmt = "mmm d, yyyy";
  sheet.getCell("D3").value = formatWeekRange(week);
  [sheet.getCell("A2"), sheet.getCell("A3")].forEach((cell) => { cell.font = { bold: true, color: { argb: MUTED } }; });
  sheet.getCell("B2").font = { bold: true, color: { argb: INK } };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .25, right: .25, top: .5, bottom: .5, header: .2, footer: .2 } };
}

function styleHeader(row: Row, color = BLUE) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder();
  });
}

function styleData(sheet: Worksheet, firstRow: number, lastRow: number, firstColumn: number, lastColumn: number) {
  if (lastRow < firstRow) return;
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.border = thinBorder();
      cell.alignment = { vertical: "top", wrapText: true };
      if (row % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFC" } };
    }
  }
}

function workItemMap(state: WorkTrackingState) {
  return new Map(state.workItems.map((item) => [item.id, item]));
}

function rawHours(state: WorkTrackingState, itemId: string, date: string) {
  return state.actualEntries
    .filter((entry) => entry.workItemId === itemId && entry.date === date)
    .reduce((total, entry) => total + hoursBetween(entry.startTime, entry.endTime), 0);
}

function addActualsSheet(workbook: import("exceljs").Workbook, state: WorkTrackingState, week: string, personName: string) {
  const sheet = workbook.addWorksheet("Actuals", { views: [{ state: "frozen", ySplit: 5 }] });
  styleTitle(sheet, "Orbit Actuals", personName, week, 14);
  sheet.getCell("A4").value = "Weekly rule";
  sheet.getCell("B4").value = "At least 45 hours (Monday–Sunday; weekend entries optional)";
  sheet.getCell("B4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE_AMBER } };
  const headers = ["Date", "Day", "Start time", "End time", "Hours", "Test case count", "Bug count", "Task type", "Task", "Workstream", "Application", "Phase / subcategory", "Entry details", "Entry source"];
  sheet.addRow(headers);
  styleHeader(sheet.getRow(5));
  const items = workItemMap(state);
  const entries = entriesForWorkweek(state, week).slice().sort((left, right) => `${left.date}-${left.startTime}`.localeCompare(`${right.date}-${right.startTime}`));
  entries.forEach((entry) => {
    const item = items.get(entry.workItemId);
    const row = sheet.addRow([
      dateValue(entry.date),
      new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(dateValue(entry.date)),
      timeValue(entry.startTime),
      timeValue(entry.endTime),
      null,
      entry.testCaseCount,
      entry.bugCount,
      item?.taskType ?? "",
      item?.title ?? "Unknown task",
      item?.workstream ?? "Other",
      item?.application ?? "",
      item?.phase ?? "",
      entry.details,
      entry.entrySource === "scheduled-advance" ? "Scheduled in advance" : entry.entrySource === "timesheet-source" ? "Entered from Timesheet" : "Actual entry",
    ]);
    row.getCell(1).numFmt = "yyyy-mm-dd";
    row.getCell(3).numFmt = "h:mm AM/PM";
    row.getCell(4).numFmt = "h:mm AM/PM";
    const hours = hoursBetween(entry.startTime, entry.endTime);
    formula(row.getCell(5), `IF(OR(C${row.number}="",D${row.number}=""),0,MOD(D${row.number}-C${row.number},1)*24)`, hours);
    row.getCell(5).numFmt = "0.00";
  });
  const firstDataRow = 6;
  const lastDataRow = Math.max(firstDataRow, 5 + entries.length);
  const totalRow = lastDataRow + 2;
  sheet.getCell(`D${totalRow}`).value = "Weekly totals";
  sheet.getCell(`D${totalRow}`).font = { bold: true };
  formula(sheet.getCell(`E${totalRow}`), `SUM(E${firstDataRow}:E${lastDataRow})`, actualHoursForWeek(state, week));
  formula(sheet.getCell(`F${totalRow}`), `SUM(F${firstDataRow}:F${lastDataRow})`, entries.reduce((sum, entry) => sum + entry.testCaseCount, 0));
  formula(sheet.getCell(`G${totalRow}`), `SUM(G${firstDataRow}:G${lastDataRow})`, entries.reduce((sum, entry) => sum + entry.bugCount, 0));
  [sheet.getCell(`D${totalRow}`), sheet.getCell(`E${totalRow}`), sheet.getCell(`F${totalRow}`), sheet.getCell(`G${totalRow}`)].forEach((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE_BLUE } }; cell.border = thinBorder(); });
  formula(sheet.getCell(`E${totalRow + 1}`), `IF(E${totalRow}>=${REQUIRED_WEEKLY_HOURS},"Complete","Needs "&TEXT(${REQUIRED_WEEKLY_HOURS}-E${totalRow},"0.00")&"h")`, actualHoursForWeek(state, week) >= 45 ? "Complete" : `Needs ${(45 - actualHoursForWeek(state, week)).toFixed(2)}h`);
  sheet.getCell(`D${totalRow + 1}`).value = "45-hour check";
  sheet.getCell(`E${totalRow + 1}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: actualHoursForWeek(state, week) >= 45 ? PALE_GREEN : PALE_AMBER } };
  styleData(sheet, firstDataRow, 5 + entries.length, 1, 14);
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 14 } };
  sheet.columns = [{ width: 13 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 15 }, { width: 12 }, { width: 18 }, { width: 30 }, { width: 26 }, { width: 22 }, { width: 20 }, { width: 42 }, { width: 22 }];
  return { sheet, firstDataRow, lastDataRow, totalRow, entryCount: entries.length };
}

function addEffortPlanSheet(workbook: import("exceljs").Workbook, state: WorkTrackingState, anchorWeek: string, personName: string, actualRows: { firstDataRow: number; lastDataRow: number }) {
  const sheet = workbook.addWorksheet("Effort Plan", { views: [{ state: "frozen", ySplit: 5 }] });
  styleTitle(sheet, "Orbit Effort Plan", personName, anchorWeek, 14);
  sheet.getCell("A4").value = "Planning rule";
  sheet.getCell("B4").value = "At least 45 planned hours per workweek";
  const headers = ["Week start", "Week end", "Period", "Workstream", "Application", "Phase", "Task type", "Task description", "Planned hours", "Actual hours", "Variance", "Frequency", "Notes", "Timesheet scope"];
  sheet.addRow(headers);
  styleHeader(sheet.getRow(5), PURPLE);
  const weeks = Array.from(new Set([anchorWeek, ...state.selectedEffortWeeks.map(weekStartFromDate).filter((week) => week >= anchorWeek)])).sort();
  const firstDataRow = 6;
  weeks.forEach((week) => state.workItems.forEach((item) => {
    const planned = item.plannedHoursByWeek[week] ?? 0;
    const actual = week === anchorWeek ? workItemActualHoursForWeek(state, item.id, week) : 0;
    const row = sheet.addRow([dateValue(week), null, null, item.workstream, item.application, item.phase, item.taskType, item.title, planned, null, null, item.frequency, item.notes, null]);
    row.getCell(1).numFmt = "yyyy-mm-dd";
    formula(row.getCell(2), `A${row.number}+6`, dateValue(addDays(week, 6)));
    row.getCell(2).numFmt = "yyyy-mm-dd";
    const period = week === anchorWeek ? "Past / selected week" : "Forecast";
    formula(row.getCell(3), `IF(A${row.number}=$B$3,"Past / selected week",IF(A${row.number}>$B$3,"Forecast","Past"))`, period);
    const actualFormula = `SUMIFS('Actuals'!$E$${actualRows.firstDataRow}:$E$${actualRows.lastDataRow},'Actuals'!$I$${actualRows.firstDataRow}:$I$${actualRows.lastDataRow},H${row.number},'Actuals'!$A$${actualRows.firstDataRow}:$A$${actualRows.lastDataRow},">="&A${row.number},'Actuals'!$A$${actualRows.firstDataRow}:$A$${actualRows.lastDataRow},"<="&B${row.number})`;
    formula(row.getCell(10), actualFormula, actual);
    formula(row.getCell(11), `J${row.number}-I${row.number}`, actual - planned);
    formula(row.getCell(14), `IF(OR(D${row.number}="Innovation",G${row.number}="Innovation"),"Excluded - Innovation","Included")`, isInnovationWorkItem(item) ? "Excluded - Innovation" : "Included");
    [9, 10, 11].forEach((column) => { row.getCell(column).numFmt = "0.00"; });
  }));
  const lastDataRow = Math.max(firstDataRow, sheet.rowCount);
  const summaryStart = lastDataRow + 3;
  sheet.getCell(`A${summaryStart}`).value = "Week";
  sheet.getCell(`B${summaryStart}`).value = "Planned total";
  sheet.getCell(`C${summaryStart}`).value = "Actual total";
  sheet.getCell(`D${summaryStart}`).value = "Plan status";
  styleHeader(sheet.getRow(summaryStart), PURPLE);
  weeks.forEach((week, index) => {
    const row = summaryStart + 1 + index;
    sheet.getCell(`A${row}`).value = dateValue(week);
    sheet.getCell(`A${row}`).numFmt = "yyyy-mm-dd";
    const planned = plannedHoursForWeek(state, week);
    const actual = week === anchorWeek ? actualHoursForWeek(state, week) : 0;
    formula(sheet.getCell(`B${row}`), `SUMIF($A$${firstDataRow}:$A$${lastDataRow},A${row},$I$${firstDataRow}:$I$${lastDataRow})`, planned);
    formula(sheet.getCell(`C${row}`), `SUMIF($A$${firstDataRow}:$A$${lastDataRow},A${row},$J$${firstDataRow}:$J$${lastDataRow})`, actual);
    formula(sheet.getCell(`D${row}`), `IF(B${row}>=${REQUIRED_WEEKLY_HOURS},"Complete","Needs "&TEXT(${REQUIRED_WEEKLY_HOURS}-B${row},"0.00")&"h")`, planned >= 45 ? "Complete" : `Needs ${(45 - planned).toFixed(2)}h`);
  });
  styleData(sheet, firstDataRow, lastDataRow, 1, 14);
  styleData(sheet, summaryStart + 1, summaryStart + weeks.length, 1, 4);
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 14 } };
  sheet.columns = [{ width: 13 }, { width: 13 }, { width: 21 }, { width: 26 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 35 }, { width: 15 }, { width: 14 }, { width: 13 }, { width: 19 }, { width: 42 }, { width: 22 }];
  return { sheet, firstDataRow, lastDataRow, summaryStart, weeks };
}

function addTimesheetSheet(workbook: import("exceljs").Workbook, state: WorkTrackingState, week: string, personName: string, actualRows: { firstDataRow: number; lastDataRow: number }) {
  const sheet = workbook.addWorksheet("Timesheet Report", { views: [{ state: "frozen", ySplit: 5, xSplit: 5 }] });
  const dates = weekdayDates(week);
  const dayStartColumn = 6;
  const dayEndColumn = dayStartColumn + dates.length - 1;
  const totalColumn = dayEndColumn + 1;
  const scopeColumn = totalColumn + 1;
  const totalColumnLetter = columnLetter(totalColumn);
  const scopeColumnLetter = columnLetter(scopeColumn);
  styleTitle(sheet, "Orbit Timesheet Report", personName, week, scopeColumn);
  const eligibleActual = eligibleActualHoursForWeek(state, week);
  sheet.getCell("A4").value = "Eligible actual hours";
  const eligibleFormula = `SUMIFS('Actuals'!$E$${actualRows.firstDataRow}:$E$${actualRows.lastDataRow},'Actuals'!$J$${actualRows.firstDataRow}:$J$${actualRows.lastDataRow},"<>Innovation",'Actuals'!$H$${actualRows.firstDataRow}:$H$${actualRows.lastDataRow},"<>Innovation")`;
  formula(sheet.getCell("B4"), eligibleFormula, eligibleActual);
  sheet.getCell("C4").value = "Innovation is excluded from the 45-hour total";
  const headers: (string | Date)[] = ["Task type", "Task", "Workstream", "Application", "Subcategory / phase", ...dates.map(dateValue), "Total", "Scope"];
  sheet.addRow(headers);
  dates.forEach((_, index) => { sheet.getRow(5).getCell(6 + index).numFmt = "ddd\nmmm d"; });
  styleHeader(sheet.getRow(5));
  const generatedRows = buildTimesheetRows(state, week);
  const rowWithRawHours = (item: WorkItem) => dates.map((date) => rawHours(state, item.id, date));
  const includedWithHours = generatedRows.filter((row) => !row.excluded && rowWithRawHours(row.workItem).some((value) => value > 0));
  const includedWithoutHours = generatedRows.filter((row) => !row.excluded && !rowWithRawHours(row.workItem).some((value) => value > 0));
  const excluded = generatedRows.filter((row) => row.excluded);
  const rows = [...includedWithHours, ...includedWithoutHours, ...excluded];
  const firstDataRow = 6;
  const adjustmentItem = includedWithHours.at(-1)?.workItem;
  const adjustmentDay = adjustmentItem ? rowWithRawHours(adjustmentItem).findLastIndex((value) => value > 0) : -1;
  rows.forEach((reportRow) => {
    const resultRow = generatedRows.find((candidate) => candidate.workItem.id === reportRow.workItem.id)!;
    const row = sheet.addRow([reportRow.workItem.taskType, reportRow.workItem.title, reportRow.workItem.workstream, reportRow.workItem.application, reportRow.workItem.phase, ...dates.map(() => null), null, reportRow.excluded ? "Excluded - Innovation" : "Included"]);
    dates.forEach((date, dayIndex) => {
      const column = 6 + dayIndex;
      const raw = `SUMIFS('Actuals'!$E$${actualRows.firstDataRow}:$E$${actualRows.lastDataRow},'Actuals'!$I$${actualRows.firstDataRow}:$I$${actualRows.lastDataRow},$B${row.number},'Actuals'!$A$${actualRows.firstDataRow}:$A$${actualRows.lastDataRow},${columnLetter(column)}$5)`;
      const override = state.timesheetOverrides[timesheetOverrideKey(week, reportRow.workItem.id, date)];
      if (!reportRow.excluded && Number.isFinite(override)) {
        formula(row.getCell(column), `${override}`, resultRow.hours[dayIndex]);
        row.getCell(column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE_AMBER } };
      } else if (reportRow.excluded) {
        formula(row.getCell(column), raw, resultRow.hours[dayIndex]);
      } else if (reportRow.workItem.id === adjustmentItem?.id && dayIndex === adjustmentDay && eligibleActual >= 45) {
        const priorRows = row.number > firstDataRow ? `SUM(F${firstDataRow}:${columnLetter(dayEndColumn)}${row.number - 1})` : "0";
        const priorCells = dayIndex > 0 ? `SUM(F${row.number}:${columnLetter(column - 1)}${row.number})` : "0";
        formula(row.getCell(column), `IF($B$4<${REQUIRED_WEEKLY_HOURS},${raw},${REQUIRED_WEEKLY_HOURS}-${priorRows}-${priorCells})`, resultRow.hours[dayIndex]);
      } else {
        formula(row.getCell(column), `IF($B$4<${REQUIRED_WEEKLY_HOURS},${raw},ROUNDDOWN((${raw})/$B$4*${REQUIRED_WEEKLY_HOURS}*4,0)/4)`, resultRow.hours[dayIndex]);
      }
      row.getCell(column).numFmt = "0.00";
    });
    formula(row.getCell(totalColumn), `SUM(F${row.number}:${columnLetter(dayEndColumn)}${row.number})`, resultRow.total);
    row.getCell(totalColumn).numFmt = "0.00";
    if (reportRow.excluded) row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE_PURPLE } }; });
  });
  const lastDataRow = Math.max(firstDataRow, sheet.rowCount);
  const totalRow = lastDataRow + 2;
  sheet.getCell(`${columnLetter(dayEndColumn)}${totalRow}`).value = "Included total";
  const reportTotal = generatedRows.filter((row) => !row.excluded).reduce((sum, row) => sum + row.total, 0);
  formula(sheet.getCell(`${totalColumnLetter}${totalRow}`), `SUMIF(${scopeColumnLetter}${firstDataRow}:${scopeColumnLetter}${lastDataRow},"Included",${totalColumnLetter}${firstDataRow}:${totalColumnLetter}${lastDataRow})`, reportTotal);
  sheet.getCell(`${totalColumnLetter}${totalRow}`).numFmt = "0.00";
  const reportStatus = reportTotal === REQUIRED_WEEKLY_HOURS ? "Ready" : reportTotal < REQUIRED_WEEKLY_HOURS ? `Needs ${(REQUIRED_WEEKLY_HOURS - reportTotal).toFixed(2)}h` : `Remove ${(reportTotal - REQUIRED_WEEKLY_HOURS).toFixed(2)}h`;
  formula(sheet.getCell(`${scopeColumnLetter}${totalRow}`), `IF(${totalColumnLetter}${totalRow}=${REQUIRED_WEEKLY_HOURS},"Ready",IF(${totalColumnLetter}${totalRow}<${REQUIRED_WEEKLY_HOURS},"Needs "&TEXT(${REQUIRED_WEEKLY_HOURS}-${totalColumnLetter}${totalRow},"0.00")&"h","Remove "&TEXT(${totalColumnLetter}${totalRow}-${REQUIRED_WEEKLY_HOURS},"0.00")&"h"))`, reportStatus);
  [sheet.getCell(`${columnLetter(dayEndColumn)}${totalRow}`), sheet.getCell(`${totalColumnLetter}${totalRow}`), sheet.getCell(`${scopeColumnLetter}${totalRow}`)].forEach((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: reportTotal === 45 ? PALE_GREEN : PALE_AMBER } }; cell.border = thinBorder(); cell.font = { bold: true, color: { argb: INK } }; });
  styleData(sheet, firstDataRow, 5 + rows.length, 1, scopeColumn);
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: scopeColumn } };
  sheet.columns = [{ width: 19 }, { width: 34 }, { width: 27 }, { width: 22 }, { width: 22 }, ...dates.map(() => ({ width: 13 })), { width: 12 }, { width: 22 }];
  return { sheet, firstDataRow, lastDataRow, totalRow, reportTotal, totalColumnLetter };
}

function addDashboardSheet(workbook: import("exceljs").Workbook, state: WorkTrackingState, week: string, personName: string, actualRows: { totalRow: number; firstDataRow: number; lastDataRow: number }, effortRows: { firstDataRow: number; lastDataRow: number }, timesheetRows: { totalRow: number; reportTotal: number; totalColumnLetter: string }) {
  const sheet = workbook.addWorksheet("Dashboard & Analytics", { views: [{ state: "frozen", ySplit: 5 }] });
  styleTitle(sheet, "Orbit Dashboard & Analytics", personName, week, 8);
  sheet.getCell("A4").value = "All metrics below are formula-linked to the other workbook tabs.";
  sheet.mergeCells("A4:H4");
  sheet.getCell("A4").font = { italic: true, color: { argb: MUTED } };
  sheet.addRow(["Metric", "Value", "Rule / interpretation", "", "Weekday", "Actual hours", "Test cases", "Bugs"]);
  styleHeader(sheet.getRow(5));
  const entries = entriesForWorkweek(state, week);
  const actualTotal = actualHoursForWeek(state, week);
  const eligibleActual = eligibleActualHoursForWeek(state, week);
  const planned = plannedHoursForWeek(state, week);
  const tests = entries.reduce((sum, entry) => sum + entry.testCaseCount, 0);
  const bugs = entries.reduce((sum, entry) => sum + entry.bugCount, 0);
  const distinctTasks = new Set(entries.map((entry) => entry.workItemId)).size;
  const utilizedHours = entries.reduce((sum, entry) => {
    const item = state.workItems.find((candidate) => candidate.id === entry.workItemId);
    return sum + (item?.taskType === "Test" && /planning|execution/i.test(item.phase) ? hoursBetween(entry.startTime, entry.endTime) : 0);
  }, 0);
  const utilizationSummaryStart = Math.max(6, 5 + state.workItems.length) + 3;
  const metrics: [string, string, string | number, string][] = [
    ["Actual hours", `'Actuals'!E${actualRows.totalRow}`, actualTotal, "At least 45 hours"],
    ["Eligible actual hours", "'Timesheet Report'!B4", eligibleActual, "Innovation excluded"],
    ["Planned hours", `SUMIFS('Effort Plan'!$I$${effortRows.firstDataRow}:$I$${effortRows.lastDataRow},'Effort Plan'!$A$${effortRows.firstDataRow}:$A$${effortRows.lastDataRow},$B$3)`, planned, "At least 45 hours"],
    ["Timesheet report hours", `'Timesheet Report'!${timesheetRows.totalColumnLetter}${timesheetRows.totalRow}`, timesheetRows.reportTotal, "Exactly 45 hours"],
    ["Innovation hours", "B6-B7", Math.max(0, actualTotal - eligibleActual), "Visible but excluded from Timesheet"],
    ["Test cases worked on", `'Actuals'!F${actualRows.totalRow}`, tests, "Count from Actuals"],
    ["Bugs worked on", `'Actuals'!G${actualRows.totalRow}`, bugs, "Count from Actuals"],
    ["Distinct tasks", `IFERROR(SUMPRODUCT(('Actuals'!$I$${actualRows.firstDataRow}:$I$${actualRows.lastDataRow}<>"")/COUNTIF('Actuals'!$I$${actualRows.firstDataRow}:$I$${actualRows.lastDataRow},'Actuals'!$I$${actualRows.firstDataRow}:$I$${actualRows.lastDataRow}&"")),0)`, distinctTasks, "Unique task names"],
    ["Utilized hours", `'Utilization'!B${utilizationSummaryStart + 2}`, utilizedHours, "Test Planning and Test Execution"],
    ["Utilization vs 45h", `'Utilization'!B${utilizationSummaryStart + 5}`, utilizedHours / REQUIRED_WEEKLY_HOURS, "Utilized hours ÷ 45"],
  ];
  metrics.forEach(([label, expression, result, rule], index) => {
    const row = 6 + index;
    sheet.getCell(`A${row}`).value = label;
    formula(sheet.getCell(`B${row}`), expression, result);
    sheet.getCell(`C${row}`).value = rule;
  });
  sheet.getCell("B15").numFmt = "0.0%";
  formula(sheet.getCell("B17"), `IF(B6>=${REQUIRED_WEEKLY_HOURS},"Actuals complete","Actuals incomplete")`, actualTotal >= 45 ? "Actuals complete" : "Actuals incomplete");
  sheet.getCell("A17").value = "Actuals status";
  formula(sheet.getCell("B18"), `IF(B8>=${REQUIRED_WEEKLY_HOURS},"Effort Plan complete","Effort Plan incomplete")`, planned >= 45 ? "Effort Plan complete" : "Effort Plan incomplete");
  sheet.getCell("A18").value = "Effort Plan status";
  formula(sheet.getCell("B19"), `IF(B9=${REQUIRED_WEEKLY_HOURS},"Timesheet ready","Timesheet incomplete")`, timesheetRows.reportTotal === 45 ? "Timesheet ready" : "Timesheet incomplete");
  sheet.getCell("A19").value = "Timesheet status";

  const dates = weekdayDates(week);
  dates.forEach((date, index) => {
    const row = 6 + index;
    sheet.getCell(`E${row}`).value = dateValue(date);
    sheet.getCell(`E${row}`).numFmt = "ddd, mmm d";
    const dateRef = `E${row}`;
    const actual = entries.filter((entry) => entry.date === date).reduce((sum, entry) => sum + hoursBetween(entry.startTime, entry.endTime), 0);
    const dayTests = entries.filter((entry) => entry.date === date).reduce((sum, entry) => sum + entry.testCaseCount, 0);
    const dayBugs = entries.filter((entry) => entry.date === date).reduce((sum, entry) => sum + entry.bugCount, 0);
    formula(sheet.getCell(`F${row}`), `SUMIF('Actuals'!$A$${actualRows.firstDataRow}:$A$${actualRows.lastDataRow},${dateRef},'Actuals'!$E$${actualRows.firstDataRow}:$E$${actualRows.lastDataRow})`, actual);
    formula(sheet.getCell(`G${row}`), `SUMIF('Actuals'!$A$${actualRows.firstDataRow}:$A$${actualRows.lastDataRow},${dateRef},'Actuals'!$F$${actualRows.firstDataRow}:$F$${actualRows.lastDataRow})`, dayTests);
    formula(sheet.getCell(`H${row}`), `SUMIF('Actuals'!$A$${actualRows.firstDataRow}:$A$${actualRows.lastDataRow},${dateRef},'Actuals'!$G$${actualRows.firstDataRow}:$G$${actualRows.lastDataRow})`, dayBugs);
  });

  const workstreamStart = 20;
  sheet.getCell(`A${workstreamStart}`).value = "Workstream";
  sheet.getCell(`B${workstreamStart}`).value = "Actual hours";
  sheet.getCell(`C${workstreamStart}`).value = "Planned hours";
  sheet.getCell(`D${workstreamStart}`).value = "Test cases";
  sheet.getCell(`E${workstreamStart}`).value = "Bugs";
  styleHeader(sheet.getRow(workstreamStart), PURPLE);
  state.options.workstreams.forEach((workstream, index) => {
    const row = workstreamStart + 1 + index;
    sheet.getCell(`A${row}`).value = workstream;
    const wsActual = entries.filter((entry) => state.workItems.find((item) => item.id === entry.workItemId)?.workstream === workstream).reduce((sum, entry) => sum + hoursBetween(entry.startTime, entry.endTime), 0);
    const wsPlan = state.workItems.filter((item) => item.workstream === workstream).reduce((sum, item) => sum + (item.plannedHoursByWeek[week] ?? 0), 0);
    const wsTests = entries.filter((entry) => state.workItems.find((item) => item.id === entry.workItemId)?.workstream === workstream).reduce((sum, entry) => sum + entry.testCaseCount, 0);
    const wsBugs = entries.filter((entry) => state.workItems.find((item) => item.id === entry.workItemId)?.workstream === workstream).reduce((sum, entry) => sum + entry.bugCount, 0);
    formula(sheet.getCell(`B${row}`), `SUMIF('Actuals'!$J$${actualRows.firstDataRow}:$J$${actualRows.lastDataRow},A${row},'Actuals'!$E$${actualRows.firstDataRow}:$E$${actualRows.lastDataRow})`, wsActual);
    formula(sheet.getCell(`C${row}`), `SUMIFS('Effort Plan'!$I$${effortRows.firstDataRow}:$I$${effortRows.lastDataRow},'Effort Plan'!$D$${effortRows.firstDataRow}:$D$${effortRows.lastDataRow},A${row},'Effort Plan'!$A$${effortRows.firstDataRow}:$A$${effortRows.lastDataRow},$B$3)`, wsPlan);
    formula(sheet.getCell(`D${row}`), `SUMIF('Actuals'!$J$${actualRows.firstDataRow}:$J$${actualRows.lastDataRow},A${row},'Actuals'!$F$${actualRows.firstDataRow}:$F$${actualRows.lastDataRow})`, wsTests);
    formula(sheet.getCell(`E${row}`), `SUMIF('Actuals'!$J$${actualRows.firstDataRow}:$J$${actualRows.lastDataRow},A${row},'Actuals'!$G$${actualRows.firstDataRow}:$G$${actualRows.lastDataRow})`, wsBugs);
  });
  styleData(sheet, 6, 15, 1, 3);
  styleData(sheet, 6, 5 + dates.length, 5, 8);
  styleData(sheet, workstreamStart + 1, workstreamStart + state.options.workstreams.length, 1, 5);
  sheet.columns = [{ width: 29 }, { width: 18 }, { width: 34 }, { width: 3 }, { width: 18 }, { width: 16 }, { width: 15 }, { width: 12 }];
  return sheet;
}

function addGlossarySheet(workbook: import("exceljs").Workbook, week: string, personName: string, timesheetTotalRow: number, timesheetTotalColumn: string, timesheetTotal: number) {
  const sheet = workbook.addWorksheet("Glossary", { views: [{ state: "frozen", ySplit: 5 }] });
  styleTitle(sheet, "Orbit Work Tracking Glossary", personName, week, 4);
  sheet.getCell("A4").value = "Use this tab to interpret the workbook consistently.";
  sheet.mergeCells("A4:D4");
  sheet.addRow(["Term", "Definition", "Rule or mapping", "Workbook behavior"]);
  styleHeader(sheet.getRow(5), PURPLE);
  const entries = [
    ["Actuals", "Recorded start and end time for a task on a specific date.", "At least 45 hours per Monday–Sunday workweek; weekend columns are optional placeholders.", "Feeds Actual hours in Effort Plan and Timesheet Report."],
    ["Effort Plan", "Planned hours and task classification across selected weeks.", "At least 45 planned hours per selected workweek.", "Contains the exported actual week plus selected future forecast weeks."],
    ["Sprint / Every sprint view", "A named reporting period with user-managed start and end dates.", "Includes every Monday–Sunday workweek touched by the sprint; 45-hour rules remain weekly.", "Configured in Orbit Selection Manager and used to select the weeks included in multi-week exports."],
    ["Timesheet Report", "Weekly allocation of eligible Actuals by task and weekday.", "Included total must equal exactly 45 hours.", "Eligible Actuals above 45 are proportionally allocated; Innovation is excluded."],
    ["Reportable / eligible hours", "Actual hours eligible for the Timesheet 45-hour total.", "Excludes any item whose Workstream or Task type is Innovation.", "Formula-driven from the Actuals tab."],
    ["Innovation", "Innovation-related work identified by Workstream or Task type.", "Out of scope for Timesheet total computation.", "Remains visible in Actuals, Effort Plan, exports, and analytics."],
    ["Test case count", "Number of test cases worked on as part of a task on a date.", "Whole-number count; does not change hour totals.", "Summed by day, task, week, and workstream."],
    ["Bug count", "Number of bugs worked on as part of a task on a date.", "Whole-number count; does not change hour totals.", "Summed by day, task, week, and workstream."],
    ["LLC", "Legacy combined workstream label.", "Split into Legal and Ethics and Compliance.", "LLC is not offered as an export classification."],
    ["Legal", "Legal portion of the former LLC workstream.", "Independent workstream.", "Included in Timesheet unless Task type is Innovation."],
    ["Ethics and Compliance", "Ethics and Compliance portion of the former LLC workstream.", "Independent workstream.", "Included in Timesheet unless Task type is Innovation."],
    ["ARC", "Legacy combined workstream label.", "Split into Real Estate, Audit and Risk, and Corporate Communications.", "ARC is not offered as an export classification."],
    ["Real Estate", "Real Estate portion of the former ARC workstream.", "Independent workstream.", "Included in Timesheet unless Task type is Innovation."],
    ["Audit and Risk", "Audit and Risk portion of the former ARC workstream.", "Independent workstream.", "Included in Timesheet unless Task type is Innovation."],
    ["Corporate Communications", "Corporate Communications portion of the former ARC workstream.", "Independent workstream.", "Included in Timesheet unless Task type is Innovation."],
    ["Utilization", "Hours spent on Test work whose phase contains Planning or Execution.", "Utilized hours divided by the required 45-hour workweek; meetings do not count.", "Calculated by formula on the Utilization tab and linked to Dashboard & Analytics."],
    ["Formula: Actual hours", "MOD(End time - Start time, 1) × 24 converts Excel time values to decimal hours.", "Blank start/end returns 0; an end time must be later than its start time in Orbit.", "Used in every Actuals Hours cell."],
    ["Formula: Actual totals", "SUM adds Hours, Test case count, and Bug count columns for the weekly totals.", "Counts are independent of hours.", "Used at the bottom of Actuals and linked into Dashboard & Analytics."],
    ["Formula: Effort actual rollup", "SUMIFS totals Actuals Hours where Task matches and Date falls between Week start and Week end.", "One Actuals tab contains the workbook's selected week.", "Populates Actual hours in Effort Plan."],
    ["Formula: Variance", "Actual hours minus Planned hours.", "Positive means effort exceeded plan; negative means plan exceeds recorded effort.", "Used in every Effort Plan Variance cell."],
    ["Formula: Eligible Timesheet hours", "SUMIFS includes Actuals Hours only where both Workstream and Task type are not Innovation.", "Innovation remains visible but is outside the 45-hour total.", "Shown in Timesheet Report cell B4."],
    ["Formula: 45-hour allocation", "If eligible Actuals are at least 45, each included cell is proportionally allocated and rounded down to quarter-hours; one balancing cell supplies the remainder.", "The balancing formula makes the included total exactly 45 without counting Innovation.", "Used across Timesheet weekday cells."],
    ["Formula: Timesheet ready check", "IF(Included total = 45, Ready, Needs remaining hours).", "Exported workbook clearly flags an incomplete week.", "Used in the Timesheet total row and linked to the Dashboard."],
    ["Formula: Timesheet override", "An edited Timesheet cell is exported as a numeric formula and highlighted amber.", "The override replaces only that derived cell and can be reset to Actuals in Orbit.", "Dashboard readiness and the included total recalculate from the edited value."],
    ["Scheduled in advance", "A leave or holiday entry created from Timesheet Report for a future date.", "Creates an auditable source row in Actuals and adds the same hours to Effort Plan.", "Flows into Timesheet Report and Dashboard like other eligible work."],
    ["Philippine holidays", "Official 2026 Philippine regular holidays and special non-working days seeded as 9-hour advance entries.", "The special working EDSA observance is not treated as leave; later years are added only after an official proclamation.", "Seeded entries may be edited or deleted and are not recreated after initial migration."],
    ["Timesheet source entry", "Utilized Test Planning or Test Execution entered directly from Timesheet Report.", "Creates an Actuals row and adds the same hours to Effort Plan.", "Updates utilization, test case and bug counts, Timesheet totals, and Dashboard metrics."],
    ["Formula: Utilization classification", "IF Task type is Test and Phase contains Planning or Execution, the task is Utilized; meetings and other work are non-utilized.", "Meeting hours never count as utilized.", "Used in every Utilization Classification and Utilized hours cell."],
    ["Formula: Utilization rate", "Utilized hours divided by the required 45-hour workweek.", "Productive share is also shown as Utilized hours divided by all Actual hours.", "Used in Utilization summary and Dashboard & Analytics."],
    ["Formula: Dashboard metrics", "Cross-sheet formulas link Actuals, Effort Plan, Timesheet Report, and Utilization results.", "Changing source cells in Excel recalculates dependent metrics when Excel opens the workbook.", "Formula cells are shown in Orbit blue for auditability."],
    ["Weekly workbook", "One Excel workbook created for one selected actual week.", "Six tabs per workbook; multiple selected weeks produce multiple files.", "File name includes person/application user and week start."],
  ];
  entries.forEach((entry) => sheet.addRow(entry));
  const qcRow = 7 + entries.length;
  sheet.getCell(`A${qcRow}`).value = "Workbook formula quality check";
  formula(sheet.getCell(`B${qcRow}`), `IF('Timesheet Report'!${timesheetTotalColumn}${timesheetTotalRow}=${REQUIRED_WEEKLY_HOURS},"PASS - Timesheet is 45h","REVIEW - Timesheet is not 45h")`, timesheetTotal === REQUIRED_WEEKLY_HOURS ? "PASS - Timesheet is 45h" : "REVIEW - Timesheet is not 45h");
  sheet.mergeCells(`B${qcRow}:D${qcRow}`);
  sheet.getCell(`B${qcRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE_BLUE } };
  styleData(sheet, 6, 5 + entries.length, 1, 4);
  sheet.columns = [{ width: 28 }, { width: 58 }, { width: 54 }, { width: 58 }];
  return sheet;
}

function addUtilizationSheet(workbook: import("exceljs").Workbook, state: WorkTrackingState, week: string, personName: string, actualRows: { firstDataRow: number; lastDataRow: number }) {
  const sheet = workbook.addWorksheet("Utilization", { views: [{ state: "frozen", ySplit: 5 }] });
  styleTitle(sheet, "Orbit Utilization", personName, week, 13);
  sheet.getCell("A4").value = "Utilization rule";
  sheet.getCell("B4").value = "Test work in Planning or Execution phase counts as utilized; meetings do not count.";
  sheet.mergeCells("B4:H4");
  sheet.addRow(["Task", "Workstream", "Phase / subcategory", "Task type", "Actual hours", "Classification", "Utilized hours", "Meeting hours", "", "Weekday", "Actual hours", "Utilized hours", "Daily utilization"]);
  styleHeader(sheet.getRow(5), PURPLE);
  const weekEntries = entriesForWorkweek(state, week);
  const firstDataRow = 6;
  state.workItems.forEach((item) => {
    const actual = workItemActualHoursForWeek(state, item.id, week);
    const utilized = item.taskType === "Test" && /planning|execution/i.test(item.phase);
    const meeting = item.taskType.startsWith("Meeting");
    const classification = utilized ? "Utilized" : meeting ? "Non-utilized meeting" : "Non-utilized / review";
    const row = sheet.addRow([item.title, item.workstream, item.phase, item.taskType, null, null, null, null]);
    formula(row.getCell(5), `SUMIF('Actuals'!$I$${actualRows.firstDataRow}:$I$${actualRows.lastDataRow},A${row.number},'Actuals'!$E$${actualRows.firstDataRow}:$E$${actualRows.lastDataRow})`, actual);
    formula(row.getCell(6), `IF(AND(D${row.number}="Test",OR(ISNUMBER(SEARCH("Planning",C${row.number})),ISNUMBER(SEARCH("Execution",C${row.number})))),"Utilized",IF(ISNUMBER(SEARCH("Meeting",D${row.number})),"Non-utilized meeting","Non-utilized / review"))`, classification);
    formula(row.getCell(7), `IF(F${row.number}="Utilized",E${row.number},0)`, utilized ? actual : 0);
    formula(row.getCell(8), `IF(ISNUMBER(SEARCH("Meeting",D${row.number})),E${row.number},0)`, meeting ? actual : 0);
    [5, 7, 8].forEach((column) => { row.getCell(column).numFmt = "0.00"; });
    if (utilized) row.eachCell({ includeEmpty: true }, (cell, column) => { if (column <= 8) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE_GREEN } }; });
  });
  const lastDataRow = Math.max(firstDataRow, sheet.rowCount);
  const summaryStart = lastDataRow + 3;
  sheet.getCell(`A${summaryStart}`).value = "Utilization metric";
  sheet.getCell(`B${summaryStart}`).value = "Formula result";
  sheet.getCell(`C${summaryStart}`).value = "Definition";
  styleHeader(sheet.getRow(summaryStart), PURPLE);
  const actualTotal = actualHoursForWeek(state, week);
  const utilizedTotal = weekEntries.reduce((sum, entry) => {
    const item = state.workItems.find((candidate) => candidate.id === entry.workItemId);
    return sum + (item?.taskType === "Test" && /planning|execution/i.test(item.phase) ? hoursBetween(entry.startTime, entry.endTime) : 0);
  }, 0);
  const meetingTotal = weekEntries.reduce((sum, entry) => {
    const item = state.workItems.find((candidate) => candidate.id === entry.workItemId);
    return sum + (item?.taskType.startsWith("Meeting") ? hoursBetween(entry.startTime, entry.endTime) : 0);
  }, 0);
  const summaries: [string, string, number, string, string?][] = [
    ["Actual hours", `SUM(E${firstDataRow}:E${lastDataRow})`, actualTotal, "All Actuals for the workweek"],
    ["Utilized hours", `SUM(G${firstDataRow}:G${lastDataRow})`, utilizedTotal, "Test Planning and Test Execution"],
    ["Meeting hours", `SUM(H${firstDataRow}:H${lastDataRow})`, meetingTotal, "Meeting task types; excluded from utilization"],
    ["Other non-utilized hours", `B${summaryStart + 1}-B${summaryStart + 2}-B${summaryStart + 3}`, Math.max(0, actualTotal - utilizedTotal - meetingTotal), "Actual hours not classified as utilized or meeting"],
    ["Utilization vs 45h", `IFERROR(B${summaryStart + 2}/${REQUIRED_WEEKLY_HOURS},0)`, utilizedTotal / REQUIRED_WEEKLY_HOURS, "Utilized hours ÷ 45 required hours", "0.0%"],
    ["Productive share of Actuals", `IFERROR(B${summaryStart + 2}/B${summaryStart + 1},0)`, actualTotal ? utilizedTotal / actualTotal : 0, "Utilized hours ÷ all Actual hours", "0.0%"],
  ];
  summaries.forEach(([label, expression, result, definition, numFmt], index) => {
    const row = summaryStart + 1 + index;
    sheet.getCell(`A${row}`).value = label;
    formula(sheet.getCell(`B${row}`), expression, result);
    sheet.getCell(`C${row}`).value = definition;
    if (numFmt) sheet.getCell(`B${row}`).numFmt = numFmt;
  });

  const dates = weekdayDates(week);
  dates.forEach((date, index) => {
    const row = 6 + index;
    sheet.getCell(`J${row}`).value = dateValue(date);
    sheet.getCell(`J${row}`).numFmt = "ddd, mmm d";
    const actual = weekEntries.filter((entry) => entry.date === date).reduce((sum, entry) => sum + hoursBetween(entry.startTime, entry.endTime), 0);
    const utilized = weekEntries.filter((entry) => entry.date === date).reduce((sum, entry) => {
      const item = state.workItems.find((candidate) => candidate.id === entry.workItemId);
      return sum + (item?.taskType === "Test" && /planning|execution/i.test(item.phase) ? hoursBetween(entry.startTime, entry.endTime) : 0);
    }, 0);
    formula(sheet.getCell(`K${row}`), `SUMIF('Actuals'!$A$${actualRows.firstDataRow}:$A$${actualRows.lastDataRow},J${row},'Actuals'!$E$${actualRows.firstDataRow}:$E$${actualRows.lastDataRow})`, actual);
    const planning = `SUMIFS('Actuals'!$E$${actualRows.firstDataRow}:$E$${actualRows.lastDataRow},'Actuals'!$A$${actualRows.firstDataRow}:$A$${actualRows.lastDataRow},J${row},'Actuals'!$H$${actualRows.firstDataRow}:$H$${actualRows.lastDataRow},"Test",'Actuals'!$L$${actualRows.firstDataRow}:$L$${actualRows.lastDataRow},"*Planning*")`;
    const execution = `SUMIFS('Actuals'!$E$${actualRows.firstDataRow}:$E$${actualRows.lastDataRow},'Actuals'!$A$${actualRows.firstDataRow}:$A$${actualRows.lastDataRow},J${row},'Actuals'!$H$${actualRows.firstDataRow}:$H$${actualRows.lastDataRow},"Test",'Actuals'!$L$${actualRows.firstDataRow}:$L$${actualRows.lastDataRow},"*Execution*")`;
    formula(sheet.getCell(`L${row}`), `${planning}+${execution}`, utilized);
    formula(sheet.getCell(`M${row}`), `IFERROR(L${row}/K${row},0)`, actual ? utilized / actual : 0);
    sheet.getCell(`M${row}`).numFmt = "0.0%";
  });
  styleData(sheet, firstDataRow, 5 + state.workItems.length, 1, 8);
  styleData(sheet, 6, 5 + dates.length, 10, 13);
  styleData(sheet, summaryStart + 1, summaryStart + summaries.length, 1, 3);
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 8 } };
  sheet.columns = [{ width: 34 }, { width: 26 }, { width: 24 }, { width: 20 }, { width: 14 }, { width: 24 }, { width: 15 }, { width: 14 }, { width: 3 }, { width: 18 }, { width: 15 }, { width: 16 }, { width: 17 }];
  return { sheet, summaryStart };
}

export async function buildWorkTrackingWorkbookBuffer(state: WorkTrackingState, week: string, personName: string) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = personName;
  workbook.lastModifiedBy = personName;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = `Orbit work tracking for ${formatWeekRange(week)}`;
  workbook.title = `Orbit work tracking - ${personName} - ${week}`;
  workbook.company = "Orbit";
  workbook.calcProperties.fullCalcOnLoad = true;

  const actuals = addActualsSheet(workbook, state, week, personName);
  const effort = addEffortPlanSheet(workbook, state, week, personName, actuals);
  const timesheet = addTimesheetSheet(workbook, state, week, personName, actuals);
  addDashboardSheet(workbook, state, week, personName, actuals, effort, timesheet);
  addGlossarySheet(workbook, week, personName, timesheet.totalRow, timesheet.totalColumnLetter, timesheet.reportTotal);
  addUtilizationSheet(workbook, state, week, personName, actuals);
  return workbook.xlsx.writeBuffer();
}

function safeFilename(value: string) {
  return value.normalize("NFKD").replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").toLowerCase() || "orbit-user";
}

function downloadWorkbook(buffer: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export async function exportWorkTrackingWorkbooks({ state, weeks, personName }: ExportOptions) {
  const selectedWeeks = Array.from(new Set(weeks.map(weekStartFromDate))).sort();
  for (const week of selectedWeeks) {
    const buffer = await buildWorkTrackingWorkbookBuffer(state, week, personName);
    downloadWorkbook(buffer as ArrayBuffer, `orbit-${safeFilename(personName)}-${week}.xlsx`);
    if (selectedWeeks.length > 1) await new Promise((resolve) => window.setTimeout(resolve, 180));
  }
}
