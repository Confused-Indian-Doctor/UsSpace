import app.usspace.couple.v012.RelationshipPolicy;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

public final class RelationshipPolicyTest {
    private static int assertions = 0;
    private static void check(boolean condition, String explanation) {
        assertions++;
        if (!condition) throw new AssertionError(explanation);
    }
    private static final class FailingStore implements RelationshipPolicy.StringStore {
        final Map<String, String> memory = new LinkedHashMap<>(), disk = new LinkedHashMap<>();
        int failures = 0, commits = 0;
        @Override public String read(String key) { return memory.get(key); }
        @Override public boolean commit(Map<String, String> changes) {
            commits++;
            // Match SharedPreferences: its visible memory mutates before disk success is known.
            for (Map.Entry<String, String> entry : changes.entrySet()) {
                if (entry.getValue() == null) memory.remove(entry.getKey()); else memory.put(entry.getKey(), entry.getValue());
            }
            if (failures > 0) { failures--; return false; }
            disk.clear(); disk.putAll(memory); return true;
        }
    }
    private static Map<String, String> values(String... fields) {
        Map<String, String> result = new LinkedHashMap<>();
        for (int i = 0; i < fields.length; i += 2) result.put(fields[i], fields[i + 1]);
        return result;
    }
    public static void main(String[] args) {
        check(RelationshipPolicy.DEFAULT_START_DATE.equals("2023-03-25"), "Official relationship date");
        for (String value : new String[] {"1900-01-01", "1900-02-28", "1996-02-29", "2000-02-29", "2024-02-29", "2096-02-29", "2200-12-31", "2100-03-01"})
            check(RelationshipPolicy.validDate(value), "Real supported date: " + value);
        for (String value : new String[] {"", "1899-12-31", "2201-01-01", "1900-02-29", "2100-02-29", "2200-02-29", "2023-02-29", "2024-02-30", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-01-32", "25/03/2023", "2023-3-25", "2023-03-25T00:00:00Z", " 2023-03-25", "2023-03-25 ", "+2023-03-25", "2023-03-25\n"})
            check(!RelationshipPolicy.validDate(value), "Reject malformed/impossible date: " + value);
        check(!RelationshipPolicy.validDate(null), "Null is invalid");
        check(RelationshipPolicy.dateOrDefault("2024-02-29").equals("2024-02-29"), "Valid saved value survives restart parsing");
        check(RelationshipPolicy.dateOrDefault("2100-02-29").equals("2023-03-25"), "Malformed cache falls back safely");
        check(RelationshipPolicy.acknowledges("edit-1", "edit-1"), "Successful current save drains its operation");
        check(!RelationshipPolicy.acknowledges("edit-1", "edit-2"), "Previous save cannot drain a newer offline edit");
        check(!RelationshipPolicy.acknowledges("edit-1", ""), "Missing queue does not match old save");
        check(!RelationshipPolicy.acknowledges("", ""), "No fabricated acknowledgement");
        check(!RelationshipPolicy.acknowledges(null, null), "Null acknowledgement is invalid");
        check(RelationshipPolicy.validScopeId("couple-abc_123"), "Existing generated couple IDs are accepted");
        for (String value : new String[] {"", "../other", "couple/secret", "space with spaces", "x".repeat(141)})
            check(!RelationshipPolicy.validScopeId(value), "Unsafe scope is rejected: " + value);
        FailingStore store = new FailingStore();
        check(RelationshipPolicy.commitKeepingPrevious(store, values("guest", "2023-03-25")), "Initial local save succeeds");
        store.failures = 1;
        check(!RelationshipPolicy.commitKeepingPrevious(store, values("guest", "2024-02-29")), "Disk-full Save reports failure");
        check(store.memory.get("guest").equals("2023-03-25"), "Failed Save restores visible previous date");
        check(store.disk.get("guest").equals("2023-03-25"), "Failed Save preserves restart date");
        check(RelationshipPolicy.commitKeepingPrevious(store, values("pair:al:space", "2024-02-29", "pending:pair:al:space", "edit-1")), "Date and pending operation commit together");
        check(store.disk.get("pair:al:space").equals("2024-02-29") && store.disk.get("pending:pair:al:space").equals("edit-1"), "Durable date and queue both survive restart");
        store.failures = 2;
        check(!RelationshipPolicy.commitKeepingPrevious(store, values("pair:al:space", "2025-03-25", "pending:pair:al:space", "edit-2")), "Save and rollback disk failure remain an explicit failure");
        check(store.memory.get("pair:al:space").equals("2024-02-29") && store.memory.get("pending:pair:al:space").equals("edit-1"), "Even a full-disk rollback keeps prior memory scope and queue");
        check(store.disk.get("pair:al:space").equals("2024-02-29") && store.disk.get("pending:pair:al:space").equals("edit-1"), "Failed atomic paired edit cannot half-persist a date or queue");
        store.failures = 1;
        check(!RelationshipPolicy.commitKeepingPrevious(store, values("pending:pair:al:space", null)), "Failed acknowledgement removal is detected");
        check(store.memory.get("pending:pair:al:space").equals("edit-1") && store.disk.get("pending:pair:al:space").equals("edit-1"), "Failed acknowledgement retains the operation in memory and on disk");
        check(RelationshipPolicy.commitKeepingPrevious(store, values("pending:pair:al:space", null)), "Acknowledgement cleanup succeeds when storage returns");
        check(!store.memory.containsKey("pending:pair:al:space") && !store.disk.containsKey("pending:pair:al:space"), "Successful cleanup drains only the pending key");
        check(store.disk.get("pair:al:space").equals("2024-02-29"), "Acknowledgement cleanup preserves the saved relationship date");
        store.failures = 1;
        check(!RelationshipPolicy.commitKeepingPrevious(store, values("local:account:yashika", "2023-04-01")), "New scoped save fails explicitly");
        check(!store.memory.containsKey("local:account:yashika") && !store.disk.containsKey("local:account:yashika"), "Failed first save restores key absence instead of fabricating persistence");
        // A full date sweep catches leap-century and month-length boundaries, rather than
        // only checking the particular relationship date used by this release.
        int dates = 0;
        for (LocalDate value = LocalDate.of(1900, 1, 1); !value.isAfter(LocalDate.of(2200, 12, 31)); value = value.plusDays(1)) {
            if (!RelationshipPolicy.validDate(value.toString())) throw new AssertionError("Gregorian date rejected: " + value);
            dates++;
        }
        check(dates == 109938, "301 years of supported Gregorian dates");
        System.out.println("RelationshipPolicyTest: " + assertions + " assertions and " + dates + " valid Gregorian dates passed");
    }
}
