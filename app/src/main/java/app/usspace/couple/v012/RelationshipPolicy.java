package app.usspace.couple.v012;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.Objects;
import java.util.LinkedHashMap;
import java.util.Map;

/** Calendar validation and durable-save acknowledgement independent of Android/Firebase. */
public final class RelationshipPolicy {
    public static final String DEFAULT_START_DATE = "2023-03-25";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("uuuu-MM-dd")
            .withResolverStyle(ResolverStyle.STRICT);

    private RelationshipPolicy() { }

    public static boolean validDate(String date) {
        if (date == null || !date.matches("(?:19[0-9]{2}|2[01][0-9]{2}|2200)-[0-9]{2}-[0-9]{2}")) return false;
        try { LocalDate.parse(date, DATE); return true; }
        catch (DateTimeParseException ignored) { return false; }
    }

    public static String dateOrDefault(String date) {
        return validDate(date) ? date : DEFAULT_START_DATE;
    }

    public static boolean validScopeId(String value) {
        return value != null && value.matches("[A-Za-z0-9_-]{1,140}");
    }

    /** An older in-flight save cannot clear a later edit, even when their dates are equal. */
    public static boolean acknowledges(String sentOperation, String currentOperation) {
        return sentOperation != null && !sentOperation.isEmpty() && Objects.equals(sentOperation, currentOperation);
    }

    /** Android SharedPreferences may change memory even when its disk commit fails. */
    public interface StringStore {
        String read(String key);
        boolean commit(Map<String, String> changes);
    }

    public static boolean commitKeepingPrevious(StringStore store, Map<String, String> changes) {
        Map<String, String> previous = new LinkedHashMap<>();
        try {
            for (String key : changes.keySet()) previous.put(key, store.read(key));
            if (store.commit(changes)) return true;
        } catch (RuntimeException ignored) { }
        // Restore the previous in-memory values as well as retrying the old disk state.
        // Even if disk remains full, a failed Save must not become a new apparent cache value.
        if (previous.size() == changes.size()) try { store.commit(previous); } catch (RuntimeException ignored) { }
        return false;
    }
}
