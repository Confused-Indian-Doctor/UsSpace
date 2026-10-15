package app.usspace.couple.v012;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Meaningful-event parity, private-field exclusion and native retry/expiry boundaries. */
public final class PushEventPolicyTest {
    private static int assertions;
    private static Map<String,Object> map(Object... values) {
        Map<String,Object> value = new LinkedHashMap<>();
        for (int i = 0; i < values.length; i += 2) value.put((String)values[i], values[i + 1]);
        return value;
    }
    private static void check(boolean actual, String message) { assertions++; if (!actual) throw new AssertionError(message); }
    private static List<String> changes(String kind, Map<String,Object> a, Map<String,Object> b) {
        return PushEventPolicy.categories(kind, a, b, LocalDate.of(2026, 10, 15));
    }
    private static void expect(String kind, Map<String,Object> a, Map<String,Object> b, String... expected) {
        List<String> actual = changes(kind, a, b);
        check(actual.equals(Arrays.asList(expected)), "Wrong " + kind + " categories: " + actual + " expected " + Arrays.toString(expected));
    }
    private static Map<String,Object> common(Object... values) { return map("payload", map(values), "updatedBy", "al"); }
    public static void main(String[] args) {
        Map<String,Object> empty = common();
        expect("common", null, common("notes", List.of(map("id", 1, "text", "hello"))));
        expect("common", map(), common("notes", List.of(map("id", 1, "text", "hello"))));
        expect("common", empty, common("notes", List.of(map("id", 1, "text", "hello"))), "notes");
        expect("common", empty, common("notes", List.of(map("id", 1, "kind", "ping"))), "pings");
        expect("common", empty, common("notes", List.of(map("id", 1, "kind", "ping"), map("id", 2, "text", "hello"))), "pings", "notes");
        expect("common", common("notes", List.of(map("id", 1, "text", "before"))), common("notes", List.of(map("id", 1, "text", "edited"))));
        expect("common", common("notes", List.of(map("id", 1, "text", "before"))), empty);
        for (String flag : new String[]{"level", "private", "visibility", "share"}) {
            Object value = flag.equals("level") ? "Private" : flag.equals("visibility") ? "private" : flag.equals("share") ? false : true;
            for (String key : new String[]{"notes", "goals", "memories", "duties"}) expect("common", empty, common(key, List.of(map("id", 1, flag, value, "date", "2026-10-16"))));
        }
        expect("common", empty, common("health", map("steps", 10000), "cycle", map("period", true), "mood", "sad", "learn", map("progress", 1)));
        expect("common", empty, common("goals", List.of(map("id", "g", "title", "Read"))), "goals");
        expect("common", common("goals", List.of(map("id", "g", "value", 1))), common("goals", List.of(map("id", "g", "value", 1.0))));
        expect("common", common("goals", List.of(map("id", "g", "value", 1))), common("goals", List.of(map("id", "g", "value", 2))), "goals");
        expect("common", common("goals", List.of(map("id", "g", "value", 1))), empty, "goals");
        expect("common", empty, common("memories", List.of(map("id", "m", "title", "Us"))), "memories");
        expect("common", common("memories", List.of(map("id", "m", "title", "Us"))), common("memories", List.of(map("id", "m", "title", "Us", "health", "secret"))));
        expect("common", empty, common("duties", List.of(map("id", "d", "date", "2026-10-14"))));
        expect("common", empty, common("duties", List.of(map("id", "d", "date", "2026-10-15"))), "calendar");
        expect("common", common("duties", List.of(map("id", "d", "date", "2026-10-16"))), empty, "calendar");
        expect("common", common("visit", "2026-10-14"), common("visit", "2026-10-13"));
        expect("common", common("visit", "2026-10-16"), common("visit", ""), "calendar");
        expect("profile", null, map("payload", map("status", "Busy")));
        expect("profile", map("payload", map("status", "Free")), map("payload", map("status", "Busy")), "status");
        expect("profile", map("payload", map("status", "Free")), map("payload", map("status", "Free", "health", map("steps", 50), "checkins", List.of(map("mood", "sad")))));
        expect("jar", null, map("text", "Thank you"), "notes");
        expect("jar", map("text", "Thank you"), map("text", "Edited"));
        expect("jar", null, map("text", "  "));
        Map<String,Object> letter = map("body", "Love you", "publishedAt", "now", "authorUid", "al", "recipientUid", "yashika");
        expect("letter", null, letter, "notes");
        expect("letter", letter, letter);
        expect("letter", null, map("body", "secret", "authorUid", "al", "recipientUid", "al"));
        expect("letter", null, map("body", "secret", "authorUid", "al", "recipientUid", 4));
        expect("draft", null, letter);
        expect("bucket", null, map("title", "Paris"), "bucket");
        expect("bucket", map("title", "Paris", "state", "Dreaming"), map("title", "Paris", "state", "Planning"), "bucket");
        expect("bucket", map("title", "Paris"), map("title", "Paris", "updatedAt", "new"));
        expect("ping", null, map("senderUid", "al"), "pings");
        expect("ping", map("senderUid", "al"), map("senderUid", "al"));
        expect("work", null, map("enabled", true, "date", "2026-10-15", "start", "08:00"), "calendar");
        expect("work", null, map("enabled", false, "date", "2026-10-15", "start", "08:00"));
        expect("work", map("enabled", true, "start", "08:00"), map("enabled", true, "start", "08:00", "tutorialRoom", "secret"));
        for (String kind : new String[]{"health", "cycle", "mood", "roles", "photo", "heart", "draft", ""}) expect(kind, null, map("text", "private", "body", "private", "enabled", true));
        for (String kind : new String[]{"common", "profile", "jar", "letter", "bucket", "ping", "work"}) expect(kind, null, null);
        check(PushEventPolicy.source("common", "common", "al", null), "Common route rejected");
        check(!PushEventPolicy.source("common", "other", "al", null), "Arbitrary common route allowed");
        check(PushEventPolicy.source("profile", "al", "al", null), "Profile route rejected");
        check(!PushEventPolicy.source("profile", "yashika", "al", null), "Other user's profile allowed");
        check(PushEventPolicy.source("work", "al", "al", null), "Work route rejected");
        check(!PushEventPolicy.source("work", "al", "al", "receipt"), "Work receipt bypass allowed");
        check(PushEventPolicy.source("jar", "jarid", "al", "couple_op"), "Jar receipt rejected");
        check(!PushEventPolicy.source("jar", "jarid", "al", null), "Jar without receipt allowed");
        check(!PushEventPolicy.source("draft", "draftid", "al", "couple_op"), "Private draft source allowed");
        for (String id : new String[]{"", "../private", "a/b", " ", "a".repeat(141)}) check(!PushEventPolicy.id(id), "Unsafe event ID allowed");
        long now = 1000000L;
        check(PushEventPolicy.activeEvent(now, now), "Current event expired");
        check(PushEventPolicy.activeEvent(now - 899999L, now), "Fresh retry expired");
        check(!PushEventPolicy.activeEvent(now - 900000L, now), "15-minute event replay allowed");
        check(!PushEventPolicy.activeEvent(now + 300001L, now), "Future event accepted");
        for (int status : new int[]{401, 408, 429, 500, 503}) check(PushEventPolicy.retryable(status), "Transient response abandoned");
        for (int status : new int[]{200, 400, 403, 404, 409, 410}) check(!PushEventPolicy.retryable(status), "Permanent response retried");
        long knownReady = 1000L;
        check(!PushEventPolicy.capabilityUsable(false, -1L, knownReady), "Unknown service treated as ready");
        check(!PushEventPolicy.capabilityUsable(true, -1L, knownReady), "Ready without a successful check admitted");
        check(PushEventPolicy.capabilityUsable(true, knownReady, knownReady), "Fresh capability rejected");
        check(PushEventPolicy.capabilityUsable(true, knownReady, knownReady + 300000L), "First action after five-minute idle lost its event");
        check(PushEventPolicy.capabilityRefreshDue(knownReady, knownReady + 300000L), "Five-minute action did not refresh capabilities asynchronously");
        check(!PushEventPolicy.capabilityRefreshDue(knownReady, knownReady + 299999L), "Fresh capability check repeated too early");
        check(PushEventPolicy.capabilityRefreshDue(-1L, knownReady), "New process failed to check capabilities");
        check(PushEventPolicy.capabilityUsable(true, knownReady, knownReady + 86399999L), "Known healthy service lost trust during a temporary outage");
        check(!PushEventPolicy.capabilityUsable(true, knownReady, knownReady + 86400000L), "24-hour hard expiry bypassed");
        check(!PushEventPolicy.capabilityUsable(false, knownReady, knownReady + 600000L), "Explicit server/rules denial retained old capability");
        check(!PushEventPolicy.capabilityUsable(true, knownReady, knownReady - 1L), "Monotonic-clock rollback extended trust");
        check(PushEventPolicy.capabilityRefreshDue(knownReady, knownReady - 1L), "Monotonic-clock reset failed to recheck setup");
        System.out.println("NATIVE_PUSH_EVENT_POLICY_TEST_OK (" + assertions + " meaningful-event, privacy, source, expiry and retry assertions)");
    }
}
