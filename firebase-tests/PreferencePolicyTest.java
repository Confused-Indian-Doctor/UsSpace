package app.usspace.couple.v012;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public final class PreferencePolicyTest {
    private static int assertions;
    private static void check(boolean passed, String description) { if (!passed) throw new AssertionError(description); assertions++; }
    private static Map<String, Object> patch(Object... fields) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < fields.length; i += 2) result.put((String) fields[i], fields[i + 1]);
        return result;
    }
    @SuppressWarnings("unchecked")
    public static void main(String[] args) {
        Map<String, Object> defaults = PreferencePolicy.defaults();
        check(!PreferencePolicy.allows(defaults, "pings", Instant.now()), "fresh installs must not opt in");
        Map<String, Object> prefs = PreferencePolicy.apply(defaults, patch("theme", "dark", "notifications.enabled", true, "notifications.categories.notes", false, "notifications.quietHours.timeZone", "UTC"));
        check(PreferencePolicy.allows(prefs, "pings", Instant.parse("2026-10-08T12:00:00Z")), "enabled known category");
        check(!PreferencePolicy.allows(prefs, "notes", Instant.now()), "disabled category");
        check(!PreferencePolicy.allows(prefs, "health", Instant.now()), "health never becomes a category");
        check(!PreferencePolicy.allows(prefs, "cycle", Instant.now()), "cycle never becomes a category");
        Map<String, Object> quiet = PreferencePolicy.apply(prefs, patch("notifications.quietHours.enabled", true));
        check(!PreferencePolicy.quietNow(quiet, Instant.parse("2026-10-08T21:59:00Z")), "before quiet start");
        check(PreferencePolicy.quietNow(quiet, Instant.parse("2026-10-08T22:00:00Z")), "inclusive overnight start");
        check(PreferencePolicy.quietNow(quiet, Instant.parse("2026-10-09T00:00:00Z")), "midnight remains quiet");
        check(PreferencePolicy.quietNow(quiet, Instant.parse("2026-10-09T06:59:00Z")), "before end quiet");
        check(!PreferencePolicy.quietNow(quiet, Instant.parse("2026-10-09T07:00:00Z")), "exclusive quiet end");
        check(!PreferencePolicy.allows(quiet, "pings", Instant.parse("2026-10-08T23:00:00Z")), "quiet hours suppress enabled alerts");
        Map<String, Object> day = PreferencePolicy.apply(prefs, patch("notifications.quietHours.enabled", true, "notifications.quietHours.start", "08:00", "notifications.quietHours.end", "17:00"));
        check(PreferencePolicy.quietNow(day, Instant.parse("2026-10-08T10:00:00Z")), "daytime quiet");
        check(!PreferencePolicy.quietNow(day, Instant.parse("2026-10-08T22:00:00Z")), "daytime range does not quiet night");
        check(PreferencePolicy.quietNow(PreferencePolicy.apply(day, patch("notifications.quietHours.end", "08:00")), Instant.parse("2026-10-08T22:00:00Z")), "equal endpoints mean whole day");
        Map<String, Object> dst = PreferencePolicy.apply(prefs, patch("notifications.quietHours.enabled", true, "notifications.quietHours.timeZone", "Europe/London", "notifications.quietHours.start", "01:00", "notifications.quietHours.end", "02:00"));
        check(PreferencePolicy.quietNow(dst, Instant.parse("2026-10-25T00:30:00Z")), "BST quiet hour");
        check(PreferencePolicy.quietNow(dst, Instant.parse("2026-10-25T01:30:00Z")), "repeated GMT quiet hour");
        check(!PreferencePolicy.quietNow(dst, Instant.parse("2026-10-25T02:00:00Z")), "GMT exclusive end");
        check(PreferencePolicy.validZone("Asia/Kolkata"), "IANA India timezone");
        check(!PreferencePolicy.validZone("Not/AZone"), "invalid timezone rejected");
        check(!PreferencePolicy.validTime("24:00") && !PreferencePolicy.validTime("12:60") && !PreferencePolicy.validTime("1:00"), "strict HH:mm");
        for (Map<String, Object> invalid : new Map[] {patch("uid", "alice"), patch("notifications.categories.health", true), patch("notifications.enabled", "true"), patch("theme", "sepia"), patch("notifications.quietHours.start", "24:00"), patch("notifications.quietHours.timeZone", "Not/AZone")}) {
            boolean rejected = false; try { PreferencePolicy.validatePatch(invalid); } catch (IllegalArgumentException expected) { rejected = true; }
            check(rejected, "unknown or malformed patch blocked: " + invalid.keySet());
        }
        Map<String, Object> partial = PreferencePolicy.apply(prefs, patch("notifications.categories.goals", false));
        check("dark".equals(partial.get("theme")), "category changes preserve appearance");
        check(!Boolean.TRUE.equals(((Map<String, Object>) ((Map<String, Object>) partial.get("notifications")).get("categories")).get("notes")), "unrelated category preference retained");
        Map<String, Object> dirty = patch("theme", "dark", "health", patch("steps", 800), "cycle", patch("day", 6), "uid", "other");
        check(PreferencePolicy.normalize(dirty).size() == 2, "private fields are stripped from preferences");
        System.out.println("PreferencePolicyTest passed: " + assertions + " assertions");
    }
}
