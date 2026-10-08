package app.usspace.couple.v012;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** Production decision boundary: privacy, actor identity, message expiry, IANA zones and quiet hours. */
public final class NotificationPolicyTest {
    private static int assertions;
    private static void check(boolean actual, String message) { assertions++; if (!actual) throw new AssertionError(message); }
    private static Map<String, String> envelope(long now) {
        Map<String, String> result = new LinkedHashMap<>();
        result.put("v", "14"); result.put("category", "notes"); result.put("route", "jar");
        result.put("eventId", "0123456789abcdef".repeat(4)); result.put("recipientUid", "yashika-uid");
        result.put("coupleId", "private_couple_1"); result.put("sentAt", String.valueOf(now));
        result.put("title", "UsSpace"); result.put("body", "There’s a new note in your space.");
        return result;
    }
    public static void main(String[] args) {
        Instant now = Instant.parse("2026-10-08T12:00:00Z");
        Map<String, String> data = envelope(now.toEpochMilli());
        check(NotificationPolicy.valid(data, now.toEpochMilli()), "Server data-only envelope rejected");
        String[] categories = NotificationPolicy.CATEGORIES;
        String[] routes = {"home", "notes", "home", "goals", "bucket", "memories", "calendar"};
        for (int i = 0; i < categories.length; i++) {
            Map<String, String> other = new LinkedHashMap<>(data); other.put("category", categories[i]); other.put("route", routes[i]);
            check(NotificationPolicy.valid(other, now.toEpochMilli()), "Production category/route rejected: " + categories[i]);
        }
        Map<String, String> letter = new LinkedHashMap<>(data); letter.put("route", "letters");
        check(NotificationPolicy.valid(letter, now.toEpochMilli()), "Published-letter notes route rejected");
        Map<String, String> workSummary = new LinkedHashMap<>(data); workSummary.put("category", "calendar"); workSummary.put("route", "home");
        check(NotificationPolicy.valid(workSummary, now.toEpochMilli()), "Optional partner work-summary home route rejected");
        workSummary.put("route", "work-schedule");
        check(!NotificationPolicy.valid(workSummary, now.toEpochMilli()), "Private rota route admitted by calendar exception");
        Map<String, String> goalHome = new LinkedHashMap<>(data); goalHome.put("category", "goals"); goalHome.put("route", "home");
        check(!NotificationPolicy.valid(goalHome, now.toEpochMilli()), "Work-summary home exception leaked to another category");
        check(NotificationPolicy.identityMatches(data, "yashika-uid", "private_couple_1"), "Correct paired recipient rejected");
        check(!NotificationPolicy.identityMatches(data, "al-uid", "private_couple_1"), "Stale account push admitted");
        check(!NotificationPolicy.identityMatches(data, "yashika-uid", "previous_couple"), "Revoked pairing push admitted");
        check(!NotificationPolicy.identityMatches(data, "", "private_couple_1"), "Signed-out push admitted");
        for (String key : new String[]{"health", "cycle", "mood", "draft", "location", "rota", "url", "text"}) {
            Map<String, String> privateData = new LinkedHashMap<>(data); privateData.put(key, "PRIVATE_SECRET");
            check(!NotificationPolicy.valid(privateData, now.toEpochMilli()), "Unexpected/private push field admitted: " + key);
        }
        for (String category : new String[]{"health", "cycle", "mood", "work", "letters", ""}) {
            Map<String, String> other = new LinkedHashMap<>(data); other.put("category", category);
            check(!NotificationPolicy.valid(other, now.toEpochMilli()), "Private/unknown category admitted: " + category);
        }
        for (String route : new String[]{"health", "cycle", "need-me", "javascript:alert(1)", "https://example.com", "../settings", "bucket"}) {
            Map<String, String> other = new LinkedHashMap<>(data); other.put("route", route);
            check(!NotificationPolicy.valid(other, now.toEpochMilli()), "Category-incompatible route admitted: " + route);
        }
        for (String event : new String[]{"", "x", "../secret", "a".repeat(63), "A".repeat(64)}) {
            Map<String, String> other = new LinkedHashMap<>(data); other.put("eventId", event);
            check(!NotificationPolicy.valid(other, now.toEpochMilli()), "Unstable/event path admitted");
        }
        Map<String, String> old = envelope(now.toEpochMilli() - 86400001);
        check(!NotificationPolicy.valid(old, now.toEpochMilli()), "Expired push admitted");
        Map<String, String> future = envelope(now.toEpochMilli() + 300001);
        check(!NotificationPolicy.valid(future, now.toEpochMilli()), "Far-future push admitted");
        Map<String, String> badVersion = new LinkedHashMap<>(data); badVersion.put("v", "12");
        check(!NotificationPolicy.valid(badVersion, now.toEpochMilli()), "Old/non-versioned format admitted");
        check(NotificationPolicy.quiet(true, "22:00", "07:00", "Europe/London", Instant.parse("2026-10-08T21:00:00Z")), "Quiet start not inclusive");
        check(NotificationPolicy.quiet(true, "22:00", "07:00", "Europe/London", Instant.parse("2026-10-08T05:59:59Z")), "Overnight quiet lost");
        check(!NotificationPolicy.quiet(true, "22:00", "07:00", "Europe/London", Instant.parse("2026-10-08T06:00:00Z")), "Quiet end not exclusive");
        check(NotificationPolicy.quiet(true, "09:00", "17:00", "Asia/Kolkata", Instant.parse("2026-10-08T03:30:00Z")), "India zone conversion ignored");
        check(!NotificationPolicy.quiet(true, "09:00", "17:00", "Asia/Kolkata", Instant.parse("2026-10-08T11:30:00Z")), "Daytime quiet end wrong");
        check(NotificationPolicy.quiet(true, "01:00", "02:00", "Europe/London", Instant.parse("2026-10-25T00:30:00Z")), "First DST-fold quiet interval lost");
        check(NotificationPolicy.quiet(true, "01:00", "02:00", "Europe/London", Instant.parse("2026-10-25T01:30:00Z")), "Second DST-fold quiet interval lost");
        check(NotificationPolicy.quiet(true, "22:00", "07:00", "Europe/London", Instant.parse("2026-03-29T01:30:00Z")), "Spring-forward overnight quiet lost");
        check(NotificationPolicy.quiet(true, "07:00", "07:00", "UTC", now), "Full-day quiet endpoints interpreted as noisy");
        check(NotificationPolicy.quiet(true, "29:00", "07:00", "UTC", now), "Malformed quiet time failed open");
        check(NotificationPolicy.quiet(true, "22:00", "07:00", "Not/AZone", now), "Malformed IANA zone failed open");
        check(!NotificationPolicy.quiet(false, null, null, null, now), "Disabled quiet setting silenced user");
        check(NotificationPolicy.allowed(true, true, true, false, true, true), "Opted-in verified push suppressed");
        check(!NotificationPolicy.allowed(false, true, true, false, true, true), "Default off bypassed");
        check(!NotificationPolicy.allowed(true, false, true, false, true, true), "Category preference bypassed");
        check(!NotificationPolicy.allowed(true, true, false, false, true, true), "Android permission bypassed");
        check(!NotificationPolicy.allowed(true, true, true, true, true, true), "Quiet hours bypassed");
        check(!NotificationPolicy.allowed(true, true, true, false, false, true), "Account identity bypassed");
        check(!NotificationPolicy.allowed(true, true, true, false, true, false), "Server membership verification bypassed");
        int first = NotificationPolicy.notificationId(data.get("eventId"));
        check(first == NotificationPolicy.notificationId(data.get("eventId")), "Retry changed Android notification identity");
        check(first >= 0, "Notification identity not representable as positive request code");
        for (String category : NotificationPolicy.CATEGORIES) {
            check(!NotificationPolicy.body(category).contains("PRIVATE_SECRET"), "Remote private text used for notification");
            check(!NotificationPolicy.body(category).contains("08:00"), "Work time appeared in lock-screen text");
        }
        System.out.println("NATIVE_NOTIFICATION_POLICY_TEST_OK (" + assertions + " recipient, privacy, expiry, quiet-hour, DST and preference assertions)");
    }
}
