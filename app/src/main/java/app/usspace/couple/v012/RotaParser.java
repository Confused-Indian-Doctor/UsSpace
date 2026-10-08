package app.usspace.couple.v012;

import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoField;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Reads only the configured person's rows from an Excel usedRange. No network or Android state. */
public final class RotaParser {
    public static final class Config {
        public String person = "";
        public String zone = "Europe/London";
        /** Excel workbook date system; this never changes fractional clock values. */
        public boolean date1904 = false;
        /** An explicit ISO date provides year/week context for a sheet whose date cells omit it. */
        public String startDate = "";
        public int dateColumn = -1, personColumn = -1, startColumn = -1, endColumn = -1;
        public int locationColumn = -1, tutorialRoomColumn = -1, simulationColumn = -1, shiftColumn = -1;
    }

    public static final class Shift {
        public final String date, start, end, location, tutorialRoom, simulation, label;
        private Shift(LocalDate day, String start, String end, String location, String room, String simulation, String label) {
            this.date = day.toString(); this.start = start; this.end = end; this.location = location;
            this.tutorialRoom = room; this.simulation = simulation; this.label = label;
        }
    }

    public static final class Result {
        public final List<Shift> shifts;
        public final String warning;
        public final boolean success;
        private Result(List<Shift> shifts, String warning) {
            this.shifts = Collections.unmodifiableList(new ArrayList<>(shifts));
            this.warning = warning; this.success = !shifts.isEmpty();
        }
    }

    private static final int MAX_ROWS = 5000, MAX_COLUMNS = 120, MAX_SHIFTS = 730;
    private static final String TIME_TOKEN = "((?:[01]?\\d|2[0-3])(?:[:.]\\d{2}(?::\\d{2})?)?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?|[0-2]?\\d{3})";
    private static final Pattern TIME_RANGE = Pattern.compile("(?i)(?<![\\d/:.\\-])" + TIME_TOKEN + "\\s*(?:[-–—]|\\bto\\b)\\s*" + TIME_TOKEN + "(?![\\d/:.\\-])");
    private static final Pattern DATE_IN_TEXT = Pattern.compile("(?i)(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{1,2}\\s+[a-z]{3,9}\\s+\\d{4})");
    private static final DateTimeFormatter[] DATE_FORMATS = formats();

    private static final class Columns {
        int date = -1, person = -1, start = -1, end = -1, location = -1, room = -1, simulation = -1, shift = -1;
        int ownColumn = -1;
        Columns(Config c) {
            date = c.dateColumn; person = c.personColumn; start = c.startColumn; end = c.endColumn;
            location = c.locationColumn; room = c.tutorialRoomColumn; simulation = c.simulationColumn; shift = c.shiftColumn;
        }
        boolean vertical() { return date >= 0 && (person >= 0 || ownColumn >= 0); }
    }

    private static final class Context {
        LocalDate yearDate, weekStart, lastDate;
        final ZoneId zone;
        final boolean date1904;
        Context(Config config) {
            date1904 = config.date1904;
            zone = ZoneId.of(config.zone == null || config.zone.trim().isEmpty() ? "Europe/London" : config.zone.trim());
            if (config.startDate != null && !config.startDate.trim().isEmpty()) {
                yearDate = LocalDate.parse(config.startDate.trim()); weekStart = yearDate;
            }
        }
    }

    private RotaParser() { }

    public static Result parse(List<List<Object>> rows, Config config) {
        List<Shift> output = new ArrayList<>();
        if (config == null || config.person == null || config.person.length() > 240 || identity(config.person).isEmpty()) return failure("Enter the name used for you in the rota.");
        if (rows == null || rows.isEmpty()) return failure("The selected worksheet is empty.");
        if (rows.size() > MAX_ROWS) return failure("Select a smaller rota range (at most 5,000 rows).");
        for (List<Object> row : rows) if (row != null && row.size() > MAX_COLUMNS) return failure("Select a smaller rota range (at most 120 columns).");
        for (int column : new int[]{config.dateColumn, config.personColumn, config.startColumn, config.endColumn,
                config.locationColumn, config.tutorialRoomColumn, config.simulationColumn, config.shiftColumn})
            if (column < -1 || column >= MAX_COLUMNS) return failure("Check the rota column mapping.");
        Context context;
        try { context = new Context(config); } catch (RuntimeException invalid) { return failure("Check the rota start date and time zone."); }
        Columns columns = new Columns(config);
        Map<Integer, LocalDate> horizontalDates = Collections.emptyMap();
        boolean foundPerson = false, foundLayout = columns.vertical();
        int invalidDates = 0;
        Set<String> unique = new HashSet<>(), matchedIdentities = new HashSet<>();
        for (List<Object> input : rows) {
            List<Object> row = input == null ? Collections.emptyList() : input;
            if (updateWeekContext(row, context)) horizontalDates = Collections.emptyMap();
            Columns candidate;
            try { candidate = header(row, config); }
            catch (IllegalArgumentException ambiguous) { return failure("The rota headers are ambiguous. Choose the person and date columns explicitly."); }
            if (candidate != null) {
                columns = candidate; horizontalDates = Collections.emptyMap(); context.lastDate = null;
                foundLayout = true;
                continue;
            }
            Map<Integer, LocalDate> dates = columns.vertical() ? Collections.emptyMap() : horizontalHeader(row, context);
            if (dates.size() >= 2) {
                horizontalDates = dates; context.lastDate = null; foundLayout = true;
                continue;
            }
            if (!horizontalDates.isEmpty()) {
                int own = findOwnIdentity(row, config.person, horizontalDates.keySet(), config.personColumn);
                if (own < 0) continue;
                foundPerson = true;
                matchedIdentities.add(identity(text(cell(row, own), 240)));
                if (matchedIdentities.size() > 1) return failure("More than one rota name matched. Enter your exact full rota name to keep other people's shifts private.");
                for (Map.Entry<Integer, LocalDate> entry : horizontalDates.entrySet()) {
                    Shift shift = shift(entry.getValue(), cell(row, entry.getKey()), "", "",
                            cell(row, config.locationColumn), cell(row, config.tutorialRoomColumn), cell(row, config.simulationColumn));
                    add(output, unique, shift);
                }
            } else if (columns.vertical()) {
                boolean owns = columns.ownColumn >= 0 || matchesPerson(text(cell(row, columns.person), 240), config.person);
                if (!owns) {
                    // Date cells can be merged across staff rows. Observe the date, never the other staff's content.
                    LocalDate day = date(cell(row, columns.date), context);
                    if (day != null) context.lastDate = day;
                    else if (!text(cell(row, columns.date), 120).isEmpty()) context.lastDate = null;
                    continue;
                }
                foundPerson = true;
                if (columns.person >= 0) {
                    matchedIdentities.add(identity(text(cell(row, columns.person), 240)));
                    if (matchedIdentities.size() > 1) return failure("More than one rota name matched. Enter your exact full rota name to keep other people's shifts private.");
                }
                Object rawDate = cell(row, columns.date);
                LocalDate day = date(rawDate, context);
                if (day == null && text(rawDate, 120).isEmpty()) day = context.lastDate;
                if (day == null) { invalidDates++; context.lastDate = null; continue; }
                context.lastDate = day; context.yearDate = day;
                Object rawShift = cell(row, columns.ownColumn >= 0 ? columns.ownColumn : columns.shift);
                Shift shift = shift(day, rawShift, cell(row, columns.start), cell(row, columns.end),
                        cell(row, columns.location), cell(row, columns.room), cell(row, columns.simulation));
                add(output, unique, shift);
            }
            if (output.size() > MAX_SHIFTS) return failure("Select a smaller rota range (at most 730 of your shifts).");
        }
        output.sort(Comparator.comparing((Shift s) -> s.date).thenComparing(s -> s.start).thenComparing(s -> s.label));
        if (!foundLayout) return failure("Could not identify the rota layout. Map the date and person columns, or choose a worksheet with dates and your name.");
        if (!foundPerson) return failure("Your name was not matched in this range. Enter your full rota name; no other person's shifts have been imported.");
        if (output.isEmpty()) return failure(invalidDates > 0 ? "Your rows were found, but their dates could not be read. Map the date column or enter the sheet's week start date." : "Your rows were found, but no populated shifts were available.");
        return new Result(output, invalidDates > 0 ? "Some of your rows had unreadable dates and were skipped. Check the rota column mapping." : "");
    }

    private static Result failure(String message) { return new Result(Collections.emptyList(), message); }
    private static Object cell(List<Object> row, int column) { return column < 0 || column >= row.size() ? "" : row.get(column); }
    private static void add(List<Shift> output, Set<String> unique, Shift shift) {
        if (shift == null) return;
        String key = shift.date + "\u0000" + shift.start + "\u0000" + shift.end + "\u0000" + shift.location + "\u0000" + shift.tutorialRoom + "\u0000" + shift.simulation + "\u0000" + shift.label;
        if (unique.add(key)) output.add(shift);
    }

    private static Columns header(List<Object> row, Config config) {
        Columns result = new Columns(config);
        boolean dateAlias = false, personAlias = false;
        int own = -1, dateAliasIndex = -1, dateAliases = 0, personAliases = 0, ownAliases = 0;
        for (int i = 0; i < row.size(); i++) {
            String value = normalize(text(row.get(i), 240));
            if (alias(value, "date", "day", "shift date", "duty date", "rota date", "calendar date")) { if (config.dateColumn < 0) result.date = i; dateAliases++; dateAlias = true; if (dateAliasIndex < 0) dateAliasIndex = i; }
            else if (alias(value, "person", "name", "staff", "staff name", "clinician", "doctor", "fellow", "team member", "employee", "employee name")) { if (config.personColumn < 0) result.person = i; personAliases++; personAlias = true; }
            else if (alias(value, "start", "start time", "shift start", "from", "starts", "time in")) { if (config.startColumn < 0) result.start = i; }
            else if (alias(value, "end", "end time", "shift end", "finish", "finish time", "until", "time out")) { if (config.endColumn < 0) result.end = i; }
            else if (alias(value, "location", "site", "hospital", "venue", "ward", "place")) { if (config.locationColumn < 0) result.location = i; }
            else if (alias(value, "tutorial room", "tutorial", "teaching room", "room", "tutorial location")) { if (config.tutorialRoomColumn < 0) result.room = i; }
            else if (alias(value, "simulation", "sim", "simulation session", "simulation room")) { if (config.simulationColumn < 0) result.simulation = i; }
            else if (alias(value, "shift", "duty", "session", "assignment", "rota", "shift type", "activity", "hours", "time", "working hours")) { if (config.shiftColumn < 0) result.shift = i; }
            if (matchesPerson(text(row.get(i), 240), config.person)) {
                ownAliases++; if (own < 0) own = i;
            }
        }
        if (dateAlias && personAlias) {
            if ((dateAliases > 1 && config.dateColumn < 0) || (personAliases > 1 && config.personColumn < 0)) throw new IllegalArgumentException("ambiguous headers");
            return result;
        }
        if (dateAlias && own >= 0 && dateAliasIndex < own) {
            if (ownAliases > 1 || (dateAliases > 1 && config.dateColumn < 0)) throw new IllegalArgumentException("ambiguous own headers");
            result.person = -1; result.ownColumn = own; return result;
        }
        return null;
    }

    private static Map<Integer, LocalDate> horizontalHeader(List<Object> row, Context context) {
        Map<Integer, LocalDate> dates = new LinkedHashMap<>();
        for (int i = 0; i < row.size(); i++) {
            LocalDate day = date(row.get(i), context);
            if (day != null) { dates.put(i, day); context.yearDate = day; }
        }
        // A header needs different days, not multiple copies of a date formatted as Excel times.
        return new HashSet<>(dates.values()).size() >= 2 ? dates : Collections.emptyMap();
    }

    private static int findOwnIdentity(List<Object> row, String person, Set<Integer> dates, int explicitColumn) {
        if (explicitColumn >= 0) return !dates.contains(explicitColumn) && matchesPerson(text(cell(row, explicitColumn), 240), person) ? explicitColumn : -1;
        int found = -1;
        for (int i = 0; i < row.size(); i++) if (!dates.contains(i) && matchesPerson(text(row.get(i), 240), person)) {
            if (found >= 0) return -1;
            found = i;
        }
        return found;
    }

    private static boolean alias(String value, String... aliases) { for (String alias : aliases) if (value.equals(alias)) return true; return false; }
    private static String normalize(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFKD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{N}@]+", " ").trim().replaceAll("\\s+", " ");
    }
    private static String identity(String value) { return normalize(value == null ? "" : value).replaceAll("^(?:dr|doctor|mr|mrs|ms|miss|prof|professor)\\s+", ""); }
    private static boolean matchesPerson(String candidate, String person) {
        String left = identity(candidate), right = identity(person);
        if (left.isEmpty() || right.isEmpty()) return false;
        if (left.equals(right)) return true;
        // Accept a full first + last name when the workbook adds middle names. Never match Al to Alice.
        String[] expected = right.split(" "), actual = left.split(" ");
        return expected.length == 2 && actual.length > 2 && expected[0].equals(actual[0])
                && expected[expected.length - 1].equals(actual[actual.length - 1]);
    }

    private static Shift shift(LocalDate day, Object shiftValue, Object startValue, Object endValue, Object locationValue, Object roomValue, Object simulationValue) {
        String label = text(shiftValue, 500), start = time(startValue), end = time(endValue);
        Matcher range = TIME_RANGE.matcher(label);
        if (range.find()) { if (start.isEmpty()) start = time(range.group(1)); if (end.isEmpty()) end = time(range.group(2)); }
        String location = text(locationValue, 160), room = text(roomValue, 160), simulation = text(simulationValue, 160);
        if (location.isEmpty()) location = detail(label, "(?:location|site|venue|ward)");
        if (room.isEmpty()) room = detail(label, "(?:tutorial(?: room)?|teaching room)");
        if (simulation.isEmpty()) simulation = detail(label, "(?:simulation|sim)");
        if (label.isEmpty()) {
            if (!start.isEmpty() || !end.isEmpty()) label = "Shift";
            else if (!room.isEmpty() && !simulation.isEmpty()) label = "Tutorial and simulation";
            else if (!room.isEmpty()) label = "Tutorial";
            else if (!simulation.isEmpty()) label = "Simulation";
            else return null;
        }
        return new Shift(day, start, end, location, room, simulation, text(label, 240));
    }
    private static String detail(String label, String names) {
        Matcher found = Pattern.compile("(?im)(?:^|[;\\n])\\s*" + names + "\\s*:\\s*([^;\\n]+)").matcher(label);
        return found.find() ? text(found.group(1), 160) : "";
    }
    private static String text(Object value, int limit) {
        if (!(value instanceof CharSequence) && !(value instanceof Number) && !(value instanceof Boolean)) return "";
        String text = String.valueOf(value).replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "").trim();
        return text.length() > limit ? text.substring(0, limit) : text;
    }

    private static String time(Object value) {
        if (value instanceof Number) {
            double number = ((Number) value).doubleValue();
            if (!Double.isFinite(number) || number < 0 || number > 109574) return "";
            if (number <= 1 || number > 10000) {
                double fraction = number - Math.floor(number);
                int minutes = (int) Math.round(fraction * 1440) % 1440;
                return clock(minutes / 60, minutes % 60);
            }
            if (number == Math.floor(number) && number <= 23) return clock((int) number, 0);
            if (number == Math.floor(number) && number <= 2359) return clock((int) number / 100, (int) number % 100);
            return "";
        }
        String valueText = text(value, 60).toLowerCase(Locale.ROOT).replaceAll("\\s", "").replace("a.m.", "am").replace("p.m.", "pm");
        if (valueText.isEmpty()) return "";
        Matcher match = Pattern.compile("^(\\d{1,2})(?:[:.](\\d{2})(?::(\\d{2}))?)?(am|pm)?$").matcher(valueText);
        int hour, minute;
        if (match.matches()) {
            hour = Integer.parseInt(match.group(1)); minute = match.group(2) == null ? 0 : Integer.parseInt(match.group(2));
            if (match.group(3) != null && Integer.parseInt(match.group(3)) > 59) return "";
            if (match.group(4) != null) {
                if (hour < 1 || hour > 12) return "";
                hour %= 12; if (match.group(4).equals("pm")) hour += 12;
            }
            if (hour == 24 && minute == 0) hour = 0;
            return clock(hour, minute);
        }
        if (valueText.matches("\\d{3,4}")) { int numeric = Integer.parseInt(valueText); return clock(numeric / 100, numeric % 100); }
        return "";
    }
    private static String clock(int hour, int minute) { return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? String.format(Locale.ROOT, "%02d:%02d", hour, minute) : ""; }

    private static boolean updateWeekContext(List<Object> row, Context context) {
        boolean changed = false;
        for (int i = 0; i < row.size(); i++) {
            String raw = text(row.get(i), 500), normalized = normalize(raw);
            if (normalized.startsWith("week commencing") || normalized.startsWith("week beginning") || normalized.startsWith("w c") || normalized.startsWith("wc ")) {
                Matcher matcher = DATE_IN_TEXT.matcher(raw);
                LocalDate date = matcher.find() ? date(matcher.group(1), context) : date(cell(row, i + 1), context);
                if (date != null) { context.weekStart = date; context.yearDate = date; context.lastDate = null; changed = true; }
            }
        }
        return changed;
    }
    private static LocalDate date(Object value, Context context) {
        try {
            if (value instanceof LocalDate) return (LocalDate) value;
            if (value instanceof LocalDateTime) return ((LocalDateTime) value).toLocalDate();
            if (value instanceof java.util.Date) return Instant.ofEpochMilli(((java.util.Date) value).getTime()).atZone(context.zone).toLocalDate();
            if (value instanceof Number) {
                double serial = ((Number) value).doubleValue();
                if (!Double.isFinite(serial) || serial < 10000 || serial > 109574) return null;
                return LocalDate.of(1899, 12, 30).plusDays((long) Math.floor(serial) + (context.date1904 ? 1462 : 0));
            }
            String raw = text(value, 120).replaceAll("(?i)(?<=\\d)(st|nd|rd|th)\\b", "");
            if (raw.isEmpty()) return null;
            // Numeric Excel dates may arrive as strings when cells have inconsistent number formats.
            if (raw.matches("\\d{5}(?:\\.\\d+)?")) return date(Double.parseDouble(raw), context);
            if (raw.matches("\\d{4}-\\d{2}-\\d{2}[T ].*")) raw = raw.substring(0, 10);
            for (DateTimeFormatter format : DATE_FORMATS) {
                try { LocalDate day = LocalDate.parse(raw, format); if (day.getYear() >= 1900 && day.getYear() <= 2199) return day; }
                catch (DateTimeParseException ignored) { }
            }
            String normalized = normalize(raw);
            if (context.weekStart != null) {
                String[] weekdays = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"};
                for (int i = 0; i < weekdays.length; i++) if (normalized.equals(weekdays[i]) || normalized.equals(weekdays[i].substring(0, 3)))
                    return context.weekStart.plusDays((i + 1 - context.weekStart.getDayOfWeek().getValue() + 7) % 7);
            }
            if (context.yearDate != null && raw.matches("\\d{1,2}[/.-]\\d{1,2}")) {
                String[] parts = raw.split("[/.-]");
                return contextualDate(context, Integer.parseInt(parts[1]), Integer.parseInt(parts[0]));
            }
            if (context.yearDate != null && raw.matches("(?i)\\d{1,2}\\s+[a-z]{3,9}")) {
                for (int i : new int[]{4, 5}) try {
                    LocalDate valueDate = LocalDate.parse(raw + " " + context.yearDate.getYear(), DATE_FORMATS[i]);
                    return contextualDate(context, valueDate.getMonthValue(), valueDate.getDayOfMonth());
                } catch (DateTimeParseException ignored) { }
            }
        } catch (RuntimeException ignored) { }
        return null;
    }
    private static LocalDate contextualDate(Context context, int month, int day) {
        int year = context.yearDate.getYear();
        if (context.yearDate.getMonthValue() >= 11 && month <= 2) year++;
        return LocalDate.of(year, month, day);
    }
    private static DateTimeFormatter[] formats() {
        List<DateTimeFormatter> result = new ArrayList<>();
        for (String pattern : new String[]{"uuuu-M-d", "d/M/uuuu", "d-M-uuuu", "d.M.uuuu", "d MMM uuuu", "d MMMM uuuu", "EEE d MMM uuuu", "EEEE d MMMM uuuu", "d-MMM-uuuu", "d-MMMM-uuuu", "EEE d/M/uuuu", "EEEE, d MMMM uuuu", "EEEE d MMM uuuu", "EEE, d MMM uuuu"})
            result.add(new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern(pattern).toFormatter(Locale.UK).withResolverStyle(java.time.format.ResolverStyle.STRICT));
        for (String separator : new String[]{"/", "-", "."}) result.add(new DateTimeFormatterBuilder().parseCaseInsensitive().appendValue(ChronoField.DAY_OF_MONTH)
                .appendLiteral(separator).appendValue(ChronoField.MONTH_OF_YEAR).appendLiteral(separator).appendValueReduced(ChronoField.YEAR, 2, 2, 2000)
                .toFormatter(Locale.UK).withResolverStyle(java.time.format.ResolverStyle.STRICT));
        return result.toArray(new DateTimeFormatter[0]);
    }
}
