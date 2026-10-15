package app.usspace.couple.v012;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** Android-free rules shared by the read-only Samsung Health importer and its tests. */
public final class HealthSyncPolicy {
    private HealthSyncPolicy() { }
    public static final String SAMSUNG_PACKAGE = "com.sec.android.app.shealth";
    public static final String[] FIELDS = {"steps", "sleep", "hr", "kcal", "spo2", "weight", "workout"};

    public static String state(Map<String, String> fields, int errors) {
        int ready = 0, missing = 0, denied = 0;
        for (String field : FIELDS) {
            String value = fields.get(field);
            if ("ready".equals(value)) ready++;
            else if ("permission_denied".equals(value)) denied++;
            else if ("no_data".equals(value)) missing++;
        }
        if (ready == FIELDS.length && errors == 0) return "ready";
        if (ready > 0) return "partial";
        if (denied == FIELDS.length) return "permissions";
        if (missing > 0) return "no_data";
        return "error";
    }

    /** A local day starts at local midnight, including 23/25 hour daylight-saving days. */
    public static Instant dayStart(Instant now, ZoneId zone) {
        return now.atZone(zone).toLocalDate().atStartOfDay(zone).toInstant();
    }

    public static String localDate(Instant now, ZoneId zone) {
        return LocalDate.ofInstant(now, zone).toString();
    }

    /** Merge overlapping sessions, clipping sessions crossing midnight to today's range. */
    public static long coveredMillis(List<long[]> intervals, long start, long end) {
        List<long[]> clipped = new ArrayList<>();
        for (long[] interval : intervals) {
            if (interval == null || interval.length < 2) continue;
            long a = Math.max(start, interval[0]), b = Math.min(end, interval[1]);
            if (b > a) clipped.add(new long[]{a, b});
        }
        clipped.sort(Comparator.comparingLong(interval -> interval[0]));
        long total = 0, a = -1, b = -1;
        for (long[] interval : clipped) {
            if (a < 0) { a = interval[0]; b = interval[1]; }
            else if (interval[0] <= b) b = Math.max(b, interval[1]);
            else { total += b - a; a = interval[0]; b = interval[1]; }
        }
        return total + (a < 0 ? 0 : b - a);
    }

    /** Reject reads started by an old Activity, account, or superseded sync. */
    public static final class Gate {
        private long generation;
        private String uid = "";
        private boolean closed;
        public synchronized long begin(String account) {
            if (closed) return -1;
            uid = account == null ? "" : account;
            return ++generation;
        }
        public synchronized void invalidate(String account) {
            uid = account == null ? "" : account; generation++;
        }
        public synchronized boolean accepts(long token, String account) {
            return !closed && token == generation && uid.equals(account == null ? "" : account);
        }
        public synchronized void close() { closed = true; generation++; }
    }
}
