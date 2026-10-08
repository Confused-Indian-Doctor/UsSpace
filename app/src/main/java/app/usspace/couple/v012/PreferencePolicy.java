package app.usspace.couple.v012;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/** Per-account settings only. No health, cycle, mood, partner, or device-token fields. */
public final class PreferencePolicy {
    public static final String[] CATEGORIES = {"pings", "notes", "status", "goals", "bucket", "memories", "calendar"};
    private PreferencePolicy() { }

    public static Map<String, Object> defaults() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("theme", "system");
        Map<String, Object> notifications = new LinkedHashMap<>(), categories = new LinkedHashMap<>(), quiet = new LinkedHashMap<>();
        notifications.put("enabled", false);
        for (String category : CATEGORIES) categories.put(category, true);
        quiet.put("enabled", false);
        quiet.put("start", "22:00");
        quiet.put("end", "07:00");
        String zone = ZoneId.systemDefault().getId();
        quiet.put("timeZone", validZone(zone) ? zone : "UTC");
        notifications.put("categories", categories);
        notifications.put("quietHours", quiet);
        result.put("notifications", notifications);
        return result;
    }

    public static boolean validTime(Object value) {
        return value instanceof String && ((String) value).matches("(?:[01]\\d|2[0-3]):[0-5]\\d");
    }

    public static boolean validZone(Object value) {
        return value instanceof String && ((String) value).length() <= 100
                && ZoneId.getAvailableZoneIds().contains(value);
    }

    public static boolean validTheme(Object value) {
        return "system".equals(value) || "light".equals(value) || "dark".equals(value);
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> normalize(Map<String, Object> input) {
        Map<String, Object> result = defaults();
        if (input == null) return result;
        if (validTheme(input.get("theme"))) result.put("theme", input.get("theme"));
        if (!(input.get("notifications") instanceof Map)) return result;
        Map<?, ?> source = (Map<?, ?>) input.get("notifications");
        Map<String, Object> notifications = (Map<String, Object>) result.get("notifications");
        if (source.get("enabled") instanceof Boolean) notifications.put("enabled", source.get("enabled"));
        if (source.get("categories") instanceof Map) {
            Map<?, ?> incoming = (Map<?, ?>) source.get("categories");
            Map<String, Object> categories = (Map<String, Object>) notifications.get("categories");
            for (String category : CATEGORIES) if (incoming.get(category) instanceof Boolean) categories.put(category, incoming.get(category));
        }
        if (source.get("quietHours") instanceof Map) {
            Map<?, ?> incoming = (Map<?, ?>) source.get("quietHours");
            Map<String, Object> quiet = (Map<String, Object>) notifications.get("quietHours");
            if (incoming.get("enabled") instanceof Boolean) quiet.put("enabled", incoming.get("enabled"));
            for (String field : new String[] {"start", "end"}) if (validTime(incoming.get(field))) quiet.put(field, incoming.get(field));
            if (validZone(incoming.get("timeZone"))) quiet.put("timeZone", incoming.get("timeZone"));
        }
        return result;
    }

    /** Strict flat leaf patch; unknown/private data is rejected instead of silently forwarded. */
    public static Map<String, Object> validatePatch(Map<String, Object> patch) {
        if (patch == null || patch.isEmpty() || patch.size() > 16) throw new IllegalArgumentException("Choose a setting to update.");
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : patch.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();
            boolean valid = "theme".equals(key) ? validTheme(value)
                    : "notifications.enabled".equals(key) || "notifications.quietHours.enabled".equals(key) ? value instanceof Boolean
                    : "notifications.quietHours.start".equals(key) || "notifications.quietHours.end".equals(key) ? validTime(value)
                    : "notifications.quietHours.timeZone".equals(key) ? validZone(value)
                    : key.startsWith("notifications.categories.") && Arrays.asList(CATEGORIES).contains(key.substring("notifications.categories.".length())) && value instanceof Boolean;
            if (!valid) throw new IllegalArgumentException("That setting is not valid.");
            result.put(key, value);
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> apply(Map<String, Object> current, Map<String, Object> patch) {
        Map<String, Object> result = normalize(current);
        for (Map.Entry<String, Object> entry : validatePatch(patch).entrySet()) {
            String[] path = entry.getKey().split("\\.");
            Map<String, Object> target = result;
            for (int i = 0; i < path.length - 1; i++) target = (Map<String, Object>) target.get(path[i]);
            target.put(path[path.length - 1], entry.getValue());
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    public static boolean quietNow(Map<String, Object> input, Instant now) {
        Map<String, Object> settings = normalize(input);
        Map<String, Object> notifications = (Map<String, Object>) settings.get("notifications");
        Map<String, Object> quiet = (Map<String, Object>) notifications.get("quietHours");
        if (!Boolean.TRUE.equals(quiet.get("enabled"))) return false;
        ZonedDateTime local = now.atZone(ZoneId.of((String) quiet.get("timeZone")));
        int minute = local.getHour() * 60 + local.getMinute();
        int start = minute((String) quiet.get("start")), end = minute((String) quiet.get("end"));
        return start == end || (start < end ? minute >= start && minute < end : minute >= start || minute < end);
    }

    @SuppressWarnings("unchecked")
    public static boolean allows(Map<String, Object> input, String category, Instant now) {
        if (!Arrays.asList(CATEGORIES).contains(category)) return false;
        Map<String, Object> notifications = (Map<String, Object>) normalize(input).get("notifications");
        return Boolean.TRUE.equals(notifications.get("enabled"))
                && Boolean.TRUE.equals(((Map<String, Object>) notifications.get("categories")).get(category))
                && !quietNow(input, now);
    }

    private static int minute(String time) {
        return Integer.parseInt(time.substring(0, 2)) * 60 + Integer.parseInt(time.substring(3, 5));
    }
}
