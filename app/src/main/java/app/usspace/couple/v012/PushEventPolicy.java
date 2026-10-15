package app.usspace.couple.v012;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Native counterpart of functions/src/policy.mjs. Never includes user text in an event. */
public final class PushEventPolicy {
    public static final long CAPABILITY_REFRESH_MILLIS = 300000L;
    public static final long CAPABILITY_HARD_EXPIRY_MILLIS = 86400000L;
    private PushEventPolicy() { }
    /** Times are monotonic Android elapsedRealtime, so changing the calendar cannot extend trust. */
    public static boolean capabilityUsable(boolean lastKnownReady, long lastReadyMillis, long nowMillis) {
        return lastKnownReady && lastReadyMillis >= 0 && nowMillis >= lastReadyMillis
            && nowMillis - lastReadyMillis < CAPABILITY_HARD_EXPIRY_MILLIS;
    }
    public static boolean capabilityRefreshDue(long lastCheckedMillis, long nowMillis) {
        return lastCheckedMillis < 0 || nowMillis < lastCheckedMillis
            || nowMillis - lastCheckedMillis >= CAPABILITY_REFRESH_MILLIS;
    }
    public static boolean id(String value) { return value != null && value.matches("[A-Za-z0-9_-]{1,140}"); }
    @SuppressWarnings("unchecked") private static Map<String,Object> map(Object value) { return value instanceof Map ? (Map<String,Object>)value : Collections.emptyMap(); }
    private static List<?> list(Object value) { return value instanceof List ? (List<?>)value : Collections.emptyList(); }
    private static boolean publicItem(Map<String,Object> value) {
        return (value.get("id") instanceof String || value.get("id") instanceof Number)
            && !"Private".equals(value.get("level")) && !Boolean.TRUE.equals(value.get("private"))
            && !"private".equals(value.get("visibility")) && !Boolean.FALSE.equals(value.get("share"));
    }
    private static Map<String,Map<String,Object>> items(Object value) {
        Map<String,Map<String,Object>> result = new LinkedHashMap<>();
        int count = 0;
        for (Object entry : list(value)) { Map<String,Object> item = map(entry); if (!publicItem(item)) continue;
            result.put(String.valueOf(item.get("id")), item); if (++count >= 500) break; }
        return result;
    }
    private static boolean same(Object before, Object after) {
        if (before instanceof Number && after instanceof Number) return Double.compare(((Number)before).doubleValue(), ((Number)after).doubleValue()) == 0;
        return Objects.equals(before, after);
    }
    private static boolean different(Map<String,Object> before, Map<String,Object> after, String... fields) {
        for (String field : fields) if (!same(before.get(field), after.get(field))) return true;
        return false;
    }
    private static boolean relevant(Map<String,Object> item, String today) {
        Object date = item.get("date"); return date instanceof String && ((String)date).matches("\\d{4}-\\d{2}-\\d{2}") && ((String)date).compareTo(today) >= 0;
    }
    private static boolean changedList(Object before, Object after, String today, String... fields) {
        Map<String,Map<String,Object>> a = items(before), b = items(after);
        for (Map.Entry<String,Map<String,Object>> entry : b.entrySet()) if ((today == null || relevant(entry.getValue(), today))
                && (!a.containsKey(entry.getKey()) || different(a.get(entry.getKey()), entry.getValue(), fields))) return true;
        for (Map.Entry<String,Map<String,Object>> entry : a.entrySet()) if (!b.containsKey(entry.getKey()) && (today == null || relevant(entry.getValue(), today))) return true;
        return false;
    }
    public static List<String> categories(String kind, Map<String,Object> before, Map<String,Object> after) {
        return categories(kind, before, after, LocalDate.now(ZoneOffset.UTC));
    }
    public static List<String> categories(String kind, Map<String,Object> before, Map<String,Object> after, LocalDate today) {
        if (after == null) return Collections.emptyList();
        List<String> result = new ArrayList<>();
        Map<String,Object> previous = before == null ? Collections.emptyMap() : before;
        if ("common".equals(kind)) {
            if (!(previous.get("payload") instanceof Map) || !(after.get("payload") instanceof Map)) return result;
            Map<String,Object> a = map(previous.get("payload")), b = map(after.get("payload"));
            Map<String,Map<String,Object>> oldNotes = items(a.get("notes"));
            boolean ping = false, note = false;
            for (Map.Entry<String,Map<String,Object>> entry : items(b.get("notes")).entrySet()) if (!oldNotes.containsKey(entry.getKey())) {
                if ("ping".equals(entry.getValue().get("kind"))) ping = true; else note = true;
            }
            if (ping) result.add("pings"); if (note) result.add("notes");
            if (changedList(a.get("goals"), b.get("goals"), null, "title", "value", "target", "unit", "level")) result.add("goals");
            if (changedList(a.get("memories"), b.get("memories"), null, "title", "date", "place", "text", "emoji", "photoId")) result.add("memories");
            String day = today.toString(); Object visitA = a.get("visit"), visitB = b.get("visit");
            boolean visitChanged = !same(visitA, visitB) && ((visitA instanceof String && ((String)visitA).compareTo(day) >= 0)
                || (visitB instanceof String && ((String)visitB).compareTo(day) >= 0));
            if (changedList(a.get("duties"), b.get("duties"), day, "owner", "date", "type", "time", "title", "place") || visitChanged) result.add("calendar");
        } else if ("profile".equals(kind)) {
            if (previous.get("payload") instanceof Map && map(after.get("payload")).get("status") instanceof String
                    && !same(map(previous.get("payload")).get("status"), map(after.get("payload")).get("status"))) result.add("status");
        } else if ("jar".equals(kind)) {
            if (before == null && nonempty(after.get("text"))) result.add("notes");
        } else if ("letter".equals(kind)) {
            if (nonempty(after.get("body")) && (before == null || different(previous, after, "publishedAt", "body"))
                    && after.get("recipientUid") instanceof String && id((String)after.get("recipientUid")) && !same(after.get("recipientUid"), after.get("authorUid"))) result.add("notes");
        } else if ("bucket".equals(kind)) {
            if (before == null || different(previous, after, "title", "category", "location", "targetDate", "priority", "notes", "photoId", "state", "completedDate", "completedPhotoId")) result.add("bucket");
        } else if ("ping".equals(kind)) {
            if (before == null) result.add("pings");
        } else if ("work".equals(kind) && Boolean.TRUE.equals(after.get("enabled"))
                && (before == null || different(previous, after, "date", "start", "end", "timeZone"))) result.add("calendar");
        return Collections.unmodifiableList(result);
    }
    private static boolean nonempty(Object value) { return value instanceof String && !((String)value).trim().isEmpty(); }
    public static boolean retryable(int status) { return status == 401 || status == 408 || status == 429 || status >= 500; }
    public static boolean activeEvent(long createdMillis, long nowMillis) { return createdMillis > 0 && createdMillis <= nowMillis + 300000L && nowMillis - createdMillis < 900000L; }
    public static boolean source(String kind, String sourceId, String actor, String receipt) {
        if (!id(sourceId) || !id(actor)) return false;
        if ("common".equals(kind)) return "common".equals(sourceId) && receipt == null;
        if ("profile".equals(kind) || "work".equals(kind)) return actor.equals(sourceId) && receipt == null;
        if ("ping".equals(kind)) return receipt == null;
        return Arrays.asList("jar", "letter", "bucket").contains(kind) && id(receipt);
    }
}
