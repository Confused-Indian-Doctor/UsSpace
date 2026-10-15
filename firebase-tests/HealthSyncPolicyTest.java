import app.usspace.couple.v012.HealthSyncPolicy;
import java.time.Instant;
import java.time.ZoneId;
import java.time.Duration;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

public final class HealthSyncPolicyTest {
    private static int assertions;
    private static void check(boolean value, String explanation) {
        assertions++;
        if (!value) throw new AssertionError(explanation);
    }
    private static Map<String, String> fields(String state) {
        Map<String, String> result = new LinkedHashMap<>();
        for (String field : HealthSyncPolicy.FIELDS) result.put(field, state);
        return result;
    }
    public static void main(String[] args) {
        check(HealthSyncPolicy.SAMSUNG_PACKAGE.equals("com.sec.android.app.shealth"), "Restrict imported origins to Samsung Health");
        check(HealthSyncPolicy.FIELDS.length == 7, "Seven visible imported fields");
        check(HealthSyncPolicy.state(fields("permission_denied"), 0).equals("permissions"), "No access requests permission; never fabricate a zero snapshot");
        check(HealthSyncPolicy.state(fields("ready"), 0).equals("ready"), "All readable values report ready");
        check(HealthSyncPolicy.state(fields("ready"), 1).equals("partial"), "Recovered fallback error is visible");
        check(HealthSyncPolicy.state(fields("no_data"), 0).equals("no_data"), "An empty Samsung provider is not a successful import");
        check(HealthSyncPolicy.state(fields("error"), 7).equals("error"), "All read failures are errors");
        Map<String, String> partial = fields("permission_denied");
        partial.put("steps", "ready");
        check(HealthSyncPolicy.state(partial, 0).equals("partial"), "Steps-only permissions still import real steps");
        partial.put("steps", "no_data");
        check(HealthSyncPolicy.state(partial, 0).equals("no_data"), "Permitted but empty steps explain the Samsung source setup");
        partial.put("steps", "error");
        check(HealthSyncPolicy.state(partial, 1).equals("error"), "Denied other fields do not hide failure in an allowed field");
        partial.put("sleep", "no_data");
        check(HealthSyncPolicy.state(partial, 1).equals("no_data"), "A successful empty provider lookup remains distinguishable from complete outage");
        check(HealthSyncPolicy.localDate(Instant.parse("2026-10-15T00:30:00Z"), ZoneId.of("America/Los_Angeles")).equals("2026-10-14"), "Use device local date instead of UTC snapshot date");
        Instant springStart = HealthSyncPolicy.dayStart(Instant.parse("2026-03-29T12:00:00Z"), ZoneId.of("Europe/London"));
        Instant springNext = HealthSyncPolicy.dayStart(Instant.parse("2026-03-30T12:00:00Z"), ZoneId.of("Europe/London"));
        check(Duration.between(springStart, springNext).toHours() == 23, "Spring Health Connect range respects a 23-hour local day");
        Instant autumnStart = HealthSyncPolicy.dayStart(Instant.parse("2026-10-25T12:00:00Z"), ZoneId.of("Europe/London"));
        Instant autumnNext = HealthSyncPolicy.dayStart(Instant.parse("2026-10-26T12:00:00Z"), ZoneId.of("Europe/London"));
        check(Duration.between(autumnStart, autumnNext).toHours() == 25, "Autumn Health Connect range respects a 25-hour local day");
        check(HealthSyncPolicy.coveredMillis(Arrays.asList(new long[]{-10, 20}, new long[]{15, 40}, new long[]{35, 120}), 0, 100) == 100, "Overlapping exercise records clip at midnight and now without double counting");
        check(HealthSyncPolicy.coveredMillis(Arrays.asList(new long[]{10, 20}, new long[]{40, 60}), 0, 100) == 30, "Separate exercise intervals retain their real durations");
        check(HealthSyncPolicy.coveredMillis(Arrays.asList(new long[]{10, 20}, new long[]{10, 20}), 0, 100) == 10, "Duplicate sessions do not double counted minutes");
        check(HealthSyncPolicy.coveredMillis(Arrays.asList(new long[]{100, 120}, new long[]{-20, 0}, new long[]{25, 20}, null), 0, 100) == 0, "Exclude out-of-range, reversed, and invalid intervals");
        HealthSyncPolicy.Gate gate = new HealthSyncPolicy.Gate();
        long first = gate.begin("al");
        check(gate.accepts(first, "al"), "Current user's import is accepted");
        check(!gate.accepts(first, "yashika"), "Never deliver old partner/account data");
        long next = gate.begin("al");
        check(!gate.accepts(first, "al"), "Superseded sync cannot replace newer snapshot");
        check(gate.accepts(next, "al"), "Newest read is accepted");
        gate.invalidate("");
        check(!gate.accepts(next, "al"), "Sign-out cancels inflight reads");
        long guest = gate.begin(null);
        check(gate.accepts(guest, ""), "Private local guest import has an explicit empty scope");
        gate.invalidate("al");
        check(!gate.accepts(guest, ""), "Sign-in cannot reassign guest values to a signed-in account");
        long returned = gate.begin("al");
        check(!gate.accepts(first, "al") && gate.accepts(returned, "al"), "Returning to the same account cannot revive old reads");
        gate.close();
        check(!gate.accepts(returned, "al"), "Destroyed Activity cannot deliver a snapshot");
        check(gate.begin("al") == -1, "Closed importer cannot restart");
        System.out.println("HealthSyncPolicyTest: " + assertions + " assertions passed");
    }
}
