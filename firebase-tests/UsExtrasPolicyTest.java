package app.usspace.couple.v012;

import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/** Exercises production native boundaries, including payloads from a compromised JS caller. */
public final class UsExtrasPolicyTest {
    private static Map<String, Object> fields(String key, Object value) {
        Map<String, Object> result = new LinkedHashMap<>(); result.put(key, value); return result;
    }

    private static void rejected(Runnable attempt, String message) {
        try { attempt.run(); } catch (IllegalArgumentException expected) { return; }
        throw new AssertionError(message);
    }

    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }

    public static void main(String[] args) {
        for (String kind : new String[]{"roles", "bucket", "jar", "heart", "photo", "draft", "letter"}) {
            for (String privateKey : new String[]{"health", "cycle", "mood", "contact", "payload"})
                rejected(() -> UsExtrasPolicy.checkFields(kind, "item", fields(privateKey, "PRIVATE_SECRET")), "Private field admitted to " + kind);
        }
        rejected(() -> UsExtrasPolicy.checkFields("bucket", "item", fields("notes", fields("health", "PRIVATE_SECRET"))), "Nested private payload admitted");
        rejected(() -> UsExtrasPolicy.checkFields("jar", "item", fields("authorUid", fields("cycle", "PRIVATE_SECRET"))), "Nested actor metadata admitted");
        rejected(() -> UsExtrasPolicy.checkFields("bucket", "item", fields("id", "other")), "Item identity changed");
        rejected(() -> UsExtrasPolicy.id("../other"), "Path injection admitted");
        rejected(() -> UsExtrasPolicy.id("valid/other"), "Nested document path admitted");
        rejected(() -> UsExtrasPolicy.id("x".repeat(141)), "Oversized identifier admitted");
        check("entry_17".equals(UsExtrasPolicy.id("entry_17")), "Valid entity identifier rejected");
        rejected(() -> UsExtrasPolicy.date(fields("targetDate", "2026-02-29"), "targetDate"), "Impossible target date admitted");
        check("2028-02-29".equals(UsExtrasPolicy.date(fields("targetDate", "2028-02-29"), "targetDate")), "Leap date rejected");
        check("".equals(UsExtrasPolicy.date(fields("targetDate", ""), "targetDate")), "Optional date required");
        rejected(() -> UsExtrasPolicy.choice(fields("state", "Cancelled"), "state", UsExtrasPolicy.STATES), "Unknown state admitted");
        rejected(() -> UsExtrasPolicy.choice(fields("category", "PRIVATE_SECRET"), "category", UsExtrasPolicy.LETTERS), "Unknown letter category admitted");
        rejected(() -> UsExtrasPolicy.text(fields("text", " "), "text", 1500, true), "Blank appreciation note admitted");
        rejected(() -> UsExtrasPolicy.text(fields("body", "x".repeat(12001)), "body", 12000, false), "Oversized draft admitted");
        check("Written by Al\nWith love".equals(UsExtrasPolicy.text(fields("body", "Written by Al\nWith love"), "body", 12000, false)), "Letter formatting changed");
        rejected(() -> UsExtrasPolicy.jpeg(fields("data", "https://remote.example/photo.jpg")), "Remote URI admitted as photo");
        rejected(() -> UsExtrasPolicy.jpeg(fields("data", "data:image/svg+xml;base64,PHN2Zz4=")), "Executable SVG admitted");
        rejected(() -> UsExtrasPolicy.jpeg(fields("data", "data:image/jpeg;base64,PHN2Zz4=")), "Forged JPEG prefix admitted");
        String jpeg = "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(new byte[]{(byte)255, (byte)216, (byte)255, 0, (byte)255, (byte)217});
        check(jpeg.equals(UsExtrasPolicy.jpeg(fields("data", jpeg))), "JPEG byte boundary rejected");
        rejected(() -> UsExtrasPolicy.jpeg(fields("data", "data:image/jpeg;base64," + "A".repeat(140000))), "Oversized shared photo admitted");
        System.out.println("NATIVE_US_EXTRAS_POLICY_TEST_OK (private-field, nested-payload, identifier, date and image boundaries)");
    }
}
