package app.usspace.couple.v012;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Executes the production parser against actual Excel/Graph value shapes and privacy boundaries. */
public final class RotaParserTest {
    private static int assertions;
    private static List<Object> row(Object... cells) { return Arrays.asList(cells); }
    @SafeVarargs private static List<List<Object>> rows(List<Object>... rows) { return Arrays.asList(rows); }
    private static RotaParser.Config config() { RotaParser.Config result = new RotaParser.Config(); result.person = "Alameen Ashraf"; return result; }
    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void eq(Object actual, Object expected, String message) { check(expected.equals(actual), message + ": got " + actual + "; wanted " + expected); }
    private static RotaParser.Shift only(RotaParser.Result result) { check(result.success, "Result should be successful: " + result.warning); eq(result.shifts.size(), 1, "Exactly one own shift"); return result.shifts.get(0); }
    private static long serial(String date) { return java.time.temporal.ChronoUnit.DAYS.between(LocalDate.of(1899, 12, 30), LocalDate.parse(date)); }

    public static void main(String[] args) {
        RotaParser.Shift shift = only(RotaParser.parse(rows(
                row("Date", "Staff name", "Start time", "Finish time", "Hospital", "Tutorial room", "Simulation", "Duty"),
                row("08/10/2026", "Alice Smith", "09:00", "17:00", "PRIVATE COWORKER LOCATION", "PRIVATE ROOM", "PRIVATE SIM", "PRIVATE LABEL"),
                row("08/10/2026", "Dr Alameen Ashraf", 8.0 / 24, 17.0 / 24, "Golden Jubilee", "Tutorial 3", "Skills lab", "Day")), config()));
        eq(shift.date, "2026-10-08", "British date"); eq(shift.start, "08:00", "Excel fraction start"); eq(shift.end, "17:00", "Excel fraction end");
        eq(shift.location, "Golden Jubilee", "Own location"); eq(shift.tutorialRoom, "Tutorial 3", "Own tutorial room"); eq(shift.simulation, "Skills lab", "Own simulation"); eq(shift.label, "Day", "Own shift label");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Shift"), row(serial("2026-10-09"), "Alameen Ashraf", "20:00–08:00\nLocation: GJNH\nTutorial room: T2\nSimulation: Airway")), config()));
        eq(shift.date, "2026-10-09", "Excel serial date"); eq(shift.start, "20:00", "Night start"); eq(shift.end, "08:00", "Night ends next day with local end time"); eq(shift.location, "GJNH", "Inline location"); eq(shift.tutorialRoom, "T2", "Inline tutorial"); eq(shift.simulation, "Airway", "Inline simulation");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Shift"), row("2026-10-10", "Alameen Ashraf", "0800-1700")), config()));
        eq(shift.start, "08:00", "Compact range start"); eq(shift.end, "17:00", "Compact range end");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Hours"), row("10 Oct 2026", "Alameen Ashraf", "8am to 5pm")), config()));
        eq(shift.start, "08:00", "12-hour range start"); eq(shift.end, "17:00", "12-hour range end");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Start", "End"), row("10.10.2026", "Alameen Ashraf", 800, 1730)), config()));
        eq(shift.start, "08:00", "Numeric compact time"); eq(shift.end, "17:30", "Numeric compact end");
        RotaParser.Result result = RotaParser.parse(rows(row("Staff", "2026-10-12", "2026-10-13", "2026-10-14"),
                row("Alice", "SECRET", "SECRET", "SECRET"), row("Alameen Ashraf", "08.00-17.00", "Off", "Nights")), config());
        check(result.success, "Horizontal date/person grid should parse"); eq(result.shifts.size(), 3, "All three own grid entries"); eq(result.shifts.get(0).start, "08:00", "Grid time range"); eq(result.shifts.get(1).label, "Off", "Rest day retained without inventing times"); eq(result.shifts.get(1).start, "", "Off has no fabricated start"); eq(result.shifts.get(2).start, "", "Unknown shift code has no fabricated start");
        result = RotaParser.parse(rows(row("Week commencing 12/10/2026"), row("Name", "Mon", "Tue", "Wed", "Thu", "Fri"),
                row("Alameen Ashraf", "08:00-17:00", "Off", "Teaching", "", "Simulation: Skills lab")), config());
        check(result.success, "Week commencing / weekday grid should parse"); eq(result.shifts.size(), 4, "Blank weekday excluded"); eq(result.shifts.get(0).date, "2026-10-12", "Monday date derived from explicit week"); eq(result.shifts.get(3).date, "2026-10-16", "Friday date derived from explicit week");
        result = RotaParser.parse(rows(row("W/C", serial("2026-10-12")), row("Name", "Monday", "Tuesday"), row("Alameen Ashraf", "Day", "Off")), config());
        check(result.success, "Week date in neighbouring Excel numeric cell"); eq(result.shifts.size(), 2, "Numeric week heading rows");
        result = RotaParser.parse(rows(row("Date", "Alice", "Alameen Ashraf", "Bob"), row("2026-10-12", "PRIVATE", "8-17", "PRIVATE"), row("2026-10-13", "PRIVATE", "Off", "PRIVATE")), config());
        check(result.success, "Dates down / people across"); eq(result.shifts.size(), 2, "Only configured person column"); eq(result.shifts.get(0).start, "08:00", "Own person column range");
        RotaParser.Config manual = config(); manual.dateColumn = 2; manual.personColumn = 0; manual.startColumn = 3; manual.endColumn = 4; manual.locationColumn = 1;
        shift = only(RotaParser.parse(rows(row("Alameen Ashraf", "GJNH", "2026-10-15", "8am", "5pm"), row("Another", "SECRET", "2026-10-15", "8am", "5pm")), manual));
        eq(shift.location, "GJNH", "Manual unmapped headers"); eq(shift.end, "17:00", "Manual end");
        result = RotaParser.parse(rows(row("Date", "Name", "Shift"), row("2026-10-12", "Alice", "PRIVATE"), row("", "Alameen Ashraf", "8-17")), config());
        shift = only(result); eq(shift.date, "2026-10-12", "Merged date value inherited from date cell only");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Shift"), row("12/10/26", "Alameen Ashraf", "Day")), config())); eq(shift.date, "2026-10-12", "Two-digit British year");
        RotaParser.Config week = config(); week.startDate = "2026-10-12";
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Shift"), row("13/10", "Alameen Ashraf", "Day")), week)); eq(shift.date, "2026-10-13", "Explicit context for yearless date");
        result = RotaParser.parse(rows(row("Date", "Name", "Shift"), row("31/02/2026", "Alameen Ashraf", "Day")), config()); check(!result.success, "Impossible date must fail");
        result = RotaParser.parse(rows(row("Date", "Name", "Shift"), row("13/10", "Alameen Ashraf", "Day")), config()); check(!result.success, "No invented year from device date");
        result = RotaParser.parse(rows(row("Date", "Name", "Shift"), row("2026-10-12", "Alice", "SECRET")), config()); check(!result.success, "No matching name must not import coworker rows");
        RotaParser.Config shortName = config(); shortName.person = "Al";
        result = RotaParser.parse(rows(row("Date", "Name", "Shift"), row("2026-10-12", "Alice", "SECRET")), shortName); check(!result.success, "Al must not match Alice");
        result = RotaParser.parse(rows(row("Date", "Name", "Shift"), row("2026-10-12", "Alameen Ahmed Ashraf", "Day")), config()); check(result.success, "Strong first and last name with middle name");
        result = RotaParser.parse(rows(row("Date", "Shift"), row("2026-10-12", "Day")), config()); check(!result.success, "No assumed personal worksheet without identity");
        result = RotaParser.parse(rows(row("Date", "Alameen Ashraf", "Alameen Ashraf"), row("2026-10-12", "Day", "SECRET")), config()); check(!result.success, "Duplicate name headers are ambiguous");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Start", "End"), row("2026-10-12", "Alameen Ashraf", "25:00", "99:99"), row("2026-10-13", "Alameen Ashraf", "08:00", "17:00")), config())); eq(shift.date, "2026-10-13", "Invalid-time empty assignment ignored");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Tutorial room", "Simulation"), row("2026-10-12", "Alameen Ashraf", "T3", "Skills lab")), config())); eq(shift.start, "", "Tutorial-only assignment has no invented time"); eq(shift.tutorialRoom, "T3", "Tutorial-only data retained");
        result = RotaParser.parse(rows(row("Date", "Name", "Shift"), row("2026-10-12", "Alameen Ashraf", "Day"), row("2026-10-12", "Alameen Ashraf", "Day")), config()); eq(result.shifts.size(), 1, "Duplicate own entry collapsed");
        List<List<Object>> oversized = new ArrayList<>(); for (int i = 0; i < 5001; i++) oversized.add(row("")); check(!RotaParser.parse(oversized, config()).success, "Oversized row count rejected");
        List<Object> columns = new ArrayList<>(); for (int i = 0; i < 121; i++) columns.add(""); check(!RotaParser.parse(rows(columns), config()).success, "Oversized column count rejected");
        check(!RotaParser.parse(rows(row("")), null).success, "Null configuration rejected");
        result = RotaParser.parse(rows(row("Name", "2026-10-12", "2026-10-13", "2026-10-14"), row("Alameen Ashraf", "Day", "Day", "Day")), config()); eq(result.shifts.size(), 3, "Repeated Day shift codes are not mistaken for duplicate headers");
        result = RotaParser.parse(rows(row("Date", "Name", "Shift"), row("2026-10-12", "Alameen Ahmed Ashraf", "Day"), row("2026-10-13", "Alameen Ali Ashraf", "PRIVATE")), config()); check(!result.success, "Ambiguous different full names must return no shifts"); eq(result.shifts.size(), 0, "No partial import on name ambiguity");
        RotaParser.Config exactFull = config(); exactFull.person = "Alameen Ahmed Ashraf";
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Shift"), row("2026-10-12", "Alameen Ahmed Ashraf", "Day"), row("2026-10-13", "Alameen Ali Ashraf", "PRIVATE")), exactFull)); eq(shift.date, "2026-10-12", "Exact middle name resolves ambiguous names");
        result = RotaParser.parse(rows(row("Date", "Name", "Staff", "Shift"), row("2026-10-12", "Alameen Ashraf", "PRIVATE OTHER", "Day")), config()); check(!result.success, "Duplicate identity header aliases require explicit mapping");
        RotaParser.Config firstIdentity = config(); firstIdentity.personColumn = 1;
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Staff", "Shift"), row("2026-10-12", "Alameen Ashraf", "PRIVATE OTHER", "Day")), firstIdentity)); eq(shift.label, "Day", "Explicit identity mapping resolves duplicate headers");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Start", "End"), row(serial("2026-10-12"), "Alameen Ashraf", serial("2026-10-12") + 8.0/24, serial("2026-10-12") + 17.0/24)), config())); eq(shift.start, "08:00", "Full Excel date-time start is not mistaken for a horizontal header"); eq(shift.end, "17:00", "Full Excel date-time finish");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Start", "End"), row("2026-10-12", "Alameen Ashraf", 20.0/24, 1.0)), config())); eq(shift.end, "00:00", "Excel midnight one-day fraction");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Shift"), row("2026-10-12", "Alameen Ashraf", "08:00:00-17:00:00")), config())); eq(shift.start, "08:00", "Second-formatted range starts accurately"); eq(shift.end, "17:00", "Second-formatted range ends accurately");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Shift"), row("2026-10-12", "Alameen Ashraf", "2026-10-12")), config())); eq(shift.start, "", "An ISO date in a label is never converted into invented hours");
        RotaParser.Config newYear = config(); newYear.startDate = "2026-12-28";
        result = RotaParser.parse(rows(row("Name", "31/12", "01/01"), row("Alameen Ashraf", "Day", "Day")), newYear); eq(result.shifts.size(), 2, "Cross-year partial dates"); eq(result.shifts.get(1).date, "2027-01-01", "January follows explicit December context");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Shift"), row("Thursday, 8 October 2026", "Alameen Ashraf", "Day")), config())); eq(shift.date, "2026-10-08", "Long British date with weekday");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Shift"), row("8th Oct 2026", "Alameen Ashraf", "Day")), config())); eq(shift.date, "2026-10-08", "Ordinal day suffix");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Shift"), row("08-Oct-2026", "Alameen Ashraf", "Day")), config())); eq(shift.date, "2026-10-08", "Hyphenated named month");
        RotaParser.Config longMonth = config(); longMonth.startDate = "2026-10-05";
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Shift"), row("8 October", "Alameen Ashraf", "Day")), longMonth)); eq(shift.date, "2026-10-08", "Yearless long month uses explicit context");
        List<List<Object>> manyShifts = new ArrayList<>(); manyShifts.add(row("Date", "Name", "Shift")); for (int i = 0; i < 731; i++) manyShifts.add(row(LocalDate.of(2026,1,1).plusDays(i), "Alameen Ashraf", "Day")); check(!RotaParser.parse(manyShifts, config()).success, "Shift limit rejects the whole oversized import");
        RotaParser.Config date1904 = config(); date1904.date1904 = true;
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Start", "End"), row(serial("2026-10-12") - 1462, "Alameen Ashraf", 8.0/24, 17.0/24)), date1904));
        eq(shift.date, "2026-10-12", "1904 numeric date uses workbook epoch"); eq(shift.start, "08:00", "1904 date mode preserves fractional start"); eq(shift.end, "17:00", "1904 date mode preserves fractional end");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Start", "End"), row("2026-10-12", "Alameen Ashraf", 20.0/24, 1.0)), date1904));
        eq(shift.date, "2026-10-12", "1904 mode does not offset ISO date strings"); eq(shift.start, "20:00", "1904 mode keeps overnight start"); eq(shift.end, "00:00", "1904 mode keeps midnight fraction");
        shift = only(RotaParser.parse(rows(row("Date", "Name", "Shift"), row(String.valueOf(serial("2026-10-12") - 1462), "Alameen Ashraf", "8-17")), date1904));
        eq(shift.date, "2026-10-12", "1904 mode recognizes numeric serial strings");
        System.out.println("ROTA_PARSER_TEST_OK (" + assertions + " assertions: Graph/Excel layouts, British dates, times, name isolation and bounded input)");
    }
}
