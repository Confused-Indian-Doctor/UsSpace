package app.usspace.couple.v012;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Scalar-only boundaries for the new Us collections. No moods or health data belong here. */
final class UsExtrasPolicy {
    static final Set<String> CATEGORIES = values("Travel", "Food", "Adventure", "Date", "Life", "Learning", "Silly", "Future home");
    static final Set<String> STATES = values("Dreaming", "Planning", "Booked", "Done");
    static final Set<String> PRIORITIES = values("Low", "Normal", "High");
    static final Set<String> LETTERS = values("miss", "sad", "anxious", "sleep", "reassurance", "proud", "laugh", "argument");

    private UsExtrasPolicy() { }

    static Set<String> values(String... values) {
        return Collections.unmodifiableSet(new HashSet<>(Arrays.asList(values)));
    }

    static Set<String> keys(String kind) {
        switch (kind) {
            case "roles": return values("alUid", "yashikaUid");
            case "bucket": return values("id", "title", "category", "location", "targetDate", "suggestedBy", "suggestedName", "priority", "notes", "photoId", "state", "completedDate", "completedPhotoId", "createdAt", "updatedAt", "updatedBy");
            case "jar": return values("id", "text", "authorUid", "authorName", "createdAt");
            case "heart": return values("uid", "active", "at");
            case "photo": return values("id", "ownerUid", "data", "createdAt");
            case "draft": return values("id", "coupleId", "category", "title", "body", "updatedAt");
            case "letter": return values("id", "category", "title", "body", "authorUid", "recipientUid", "publishedAt");
            default: throw new IllegalArgumentException("Unknown Us update");
        }
    }

    static void checkFields(String kind, String id, Map<String, Object> fields) {
        Set<String> allowed = keys(kind);
        for (Map.Entry<String, Object> item : fields.entrySet()) {
            if (!allowed.contains(item.getKey())) throw new IllegalArgumentException("This field cannot be shared in Us");
            Object value = item.getValue();
            if (!(value instanceof String) && !(value instanceof Boolean)) throw new IllegalArgumentException("Use text or a supported choice");
        }
        if (fields.containsKey("id") && !id.equals(fields.get("id"))) throw new IllegalArgumentException("Item identity changed");
    }

    static String id(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{1,140}")) throw new IllegalArgumentException("Invalid item identity");
        return value;
    }

    static String text(Map<String, Object> fields, String key, int max, boolean required) {
        Object value = fields.get(key);
        if (!(value instanceof String)) throw new IllegalArgumentException("Missing " + key);
        String result = ((String) value).trim();
        if (result.length() > max || (required && result.isEmpty()) || result.indexOf('\u0000') >= 0)
            throw new IllegalArgumentException("Check " + key + " length");
        return result;
    }

    static String choice(Map<String, Object> fields, String key, Set<String> choices) {
        String result = text(fields, key, 160, true);
        if (!choices.contains(result)) throw new IllegalArgumentException("Choose a supported " + key);
        return result;
    }

    static String date(Map<String, Object> fields, String key) {
        String result = text(fields, key, 10, false);
        if (result.isEmpty()) return "";
        try {
            if (!result.matches("\\d{4}-\\d{2}-\\d{2}") || !LocalDate.parse(result).toString().equals(result)) throw new IllegalArgumentException();
        } catch (Exception e) { throw new IllegalArgumentException("Use a calendar date for " + key); }
        return result;
    }

    static String photoId(Map<String, Object> fields, String key) {
        String result = text(fields, key, 140, false);
        return result.isEmpty() ? "" : id(result);
    }

    static String jpeg(Map<String, Object> fields) {
        String result = text(fields, "data", 140000, true);
        String prefix = "data:image/jpeg;base64,";
        if (!result.startsWith(prefix)) throw new IllegalArgumentException("Choose a JPEG photo");
        String encoded = result.substring(prefix.length());
        if (!encoded.matches("[A-Za-z0-9+/]+={0,2}")) throw new IllegalArgumentException("Invalid photo data");
        try {
            byte[] bytes = Base64.getDecoder().decode(encoded);
            if (bytes.length < 5 || (bytes[0] & 255) != 255 || (bytes[1] & 255) != 216 || (bytes[2] & 255) != 255
                    || (bytes[bytes.length - 2] & 255) != 255 || (bytes[bytes.length - 1] & 255) != 217)
                throw new IllegalArgumentException("Invalid photo data");
        } catch (IllegalArgumentException e) { throw new IllegalArgumentException("Invalid JPEG photo"); }
        return result;
    }
}
