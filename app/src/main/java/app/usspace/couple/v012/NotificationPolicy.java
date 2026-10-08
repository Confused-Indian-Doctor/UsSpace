package app.usspace.couple.v012;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Small, independently testable boundary for untrusted push envelopes and private settings. */
public final class NotificationPolicy {
    public static final String[] CATEGORIES = {"pings", "notes", "status", "goals", "bucket", "memories", "calendar"};
    private static final Set<String> KEYS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "v", "title", "body", "category", "eventId", "route", "recipientUid", "coupleId", "sentAt")));
    private static final long MAX_AGE = 24L * 60 * 60 * 1000;
    private NotificationPolicy() { }

    public static boolean id(String value) { return value != null && value.matches("[A-Za-z0-9_-]{1,140}"); }
    public static boolean category(String value) { return Arrays.asList(CATEGORIES).contains(value); }
    public static boolean valid(Map<String, String> data, long now) {
        if (data == null || !KEYS.containsAll(data.keySet()) || !"14".equals(data.get("v"))) return false;
        if (!category(data.get("category")) || !id(data.get("recipientUid")) || !id(data.get("coupleId"))) return false;
        if (data.get("eventId") == null || !data.get("eventId").matches("[a-f0-9]{64}")) return false;
        if (!routeMatches(data.get("category"), data.get("route"))) return false;
        try {
            long sent = Long.parseLong(data.get("sentAt"));
            return sent > 0 && sent <= now + 300000 && now - sent <= MAX_AGE;
        } catch (RuntimeException ignored) { return false; }
    }

    public static boolean routeMatches(String category, String route) {
        if (category == null || route == null) return false;
        switch (category) {
            case "pings": case "status": return "home".equals(route);
            case "notes": return "notes".equals(route) || "jar".equals(route) || "letters".equals(route);
            case "goals": return "goals".equals(route);
            case "bucket": return "bucket".equals(route);
            case "memories": return "memories".equals(route);
            case "calendar": return "calendar".equals(route) || "home".equals(route);
            default: return false;
        }
    }

    public static boolean identityMatches(Map<String, String> data, String uid, String coupleId) {
        return data != null && id(uid) && id(coupleId)
                && uid.equals(data.get("recipientUid")) && coupleId.equals(data.get("coupleId"));
    }

    /** Equal endpoints intentionally mean a full quiet day; malformed enabled settings fail closed. */
    public static boolean quiet(boolean enabled, String start, String end, String zone, Instant now) {
        if (!enabled) return false;
        try {
            if (start == null || end == null || !start.matches("[0-2][0-9]:[0-5][0-9]") || !end.matches("[0-2][0-9]:[0-5][0-9]")) return true;
            LocalTime first = LocalTime.parse(start), last = LocalTime.parse(end);
            LocalTime local = now.atZone(ZoneId.of(zone)).toLocalTime();
            if (first.equals(last)) return true;
            return first.isBefore(last) ? !local.isBefore(first) && local.isBefore(last)
                    : !local.isBefore(first) || local.isBefore(last);
        } catch (RuntimeException ignored) { return true; }
    }

    public static boolean allowed(boolean optedIn, boolean categoryEnabled, boolean androidPermission,
                                  boolean isQuiet, boolean sameIdentity, boolean membershipVerified) {
        return optedIn && categoryEnabled && androidPermission && !isQuiet && sameIdentity && membershipVerified;
    }

    public static int notificationId(String eventId) {
        if (eventId == null || !eventId.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Invalid event identifier");
        return (int) (Long.parseLong(eventId.substring(0, 8), 16) & 0x7fffffffL);
    }

    /** Never use remote text, names, note bodies, health, moods or work details on the lock screen. */
    public static String body(String category) {
        switch (category == null ? "" : category) {
            case "pings": return "A little ping is waiting for you.";
            case "notes": return "A new note is waiting in your space.";
            case "status": return "There is a new update in your space.";
            case "goals": return "A shared goal has an update.";
            case "bucket": return "Your bucket list has an update.";
            case "memories": return "A shared memory has an update.";
            case "calendar": return "Your shared calendar has an update.";
            default: return "Open your private space for an update.";
        }
    }
}
