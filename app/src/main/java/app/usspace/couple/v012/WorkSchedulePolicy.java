package app.usspace.couple.v012;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** Pure validation/projection: Microsoft credentials and work details never enter the shared summary. */
public final class WorkSchedulePolicy {
    private WorkSchedulePolicy() { }
    public static boolean validClientId(String value) {
        return value != null && value.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    }
    public static boolean validTenant(String value) {
        return "common".equals(value) || "organizations".equals(value) || validClientId(value)
                || (value != null && value.matches("[A-Za-z0-9.-]{1,180}\\.onmicrosoft\\.com"));
    }
    public static boolean validLink(String value) {
        if (value == null || value.length() > 4096) return false;
        try {
            URI uri = URI.create(value); String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getRawUserInfo() != null || uri.getPort() != -1) return false;
            host = host.toLowerCase(Locale.ROOT);
            return host.endsWith(".sharepoint.com") || "1drv.ms".equals(host) || "onedrive.live.com".equals(host);
        } catch (Exception ignored) { return false; }
    }
    public static String sharingToken(String link) {
        if (!validLink(link)) throw new IllegalArgumentException("Use an HTTPS SharePoint or OneDrive Excel link.");
        return "u!" + Base64.getUrlEncoder().withoutPadding().encodeToString(link.getBytes(StandardCharsets.UTF_8));
    }
    public static boolean validTime(String time) { return time != null && time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]"); }
    public static boolean validDate(String date) {
        try { return date != null && date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}") && LocalDate.parse(date).getYear() >= 2000 && LocalDate.parse(date).getYear() <= 2100; }
        catch (Exception ignored) { return false; }
    }
    public static boolean validZone(String zone) { try { ZoneId.of(zone); return true; } catch (Exception ignored) { return false; } }
    public static boolean acceptOAuthCallback(String expectedState, String actualState, String expectedClientId, String actualClientId,
            String expectedRedirect, String actualRedirect, String expectedAuthorize, String actualAuthorize, String expectedToken, String actualToken) {
        if (expectedState == null || expectedState.length() < 16 || actualState == null || !validClientId(expectedClientId)
                || !"app.usspace.couple.v012://oauth2redirect".equals(expectedRedirect)
                || expectedAuthorize == null || expectedToken == null
                || !expectedAuthorize.matches("https://login\\.microsoftonline\\.com/[A-Za-z0-9.-]+/oauth2/v2\\.0/authorize")
                || !expectedToken.matches("https://login\\.microsoftonline\\.com/[A-Za-z0-9.-]+/oauth2/v2\\.0/token")) return false;
        return java.security.MessageDigest.isEqual(expectedState.getBytes(StandardCharsets.UTF_8), actualState.getBytes(StandardCharsets.UTF_8))
                && expectedClientId.equals(actualClientId) && expectedRedirect.equals(actualRedirect)
                && expectedAuthorize.equals(actualAuthorize) && expectedToken.equals(actualToken);
    }
    public static Map<String, Object> summary(String uid, String coupleId, String date, String start, String end, String zone, LocalDate today) {
        if (uid == null || uid.isEmpty() || coupleId == null || coupleId.isEmpty() || !validDate(date)
                || !validTime(start) || !validTime(end) || !validZone(zone) || today == null || !today.toString().equals(date)) return null;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("uid", uid); result.put("coupleId", coupleId); result.put("date", date);
        result.put("start", start); result.put("end", end); result.put("timeZone", zone); result.put("enabled", true);
        return result;
    }
}
