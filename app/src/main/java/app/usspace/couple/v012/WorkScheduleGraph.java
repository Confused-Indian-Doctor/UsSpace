package app.usspace.couple.v012;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Only GET requests. Bearer tokens are sent only to graph.microsoft.com, never to download redirects. */
final class WorkScheduleGraph {
    private static final String GRAPH = "https://graph.microsoft.com/v1.0";
    static final class Result {
        final List<List<Object>> rows; final List<String> worksheets; final String selected, warning; final boolean date1904;
        Result(List<List<Object>> rows, List<String> worksheets, String selected, String warning, boolean date1904) { this.rows = rows; this.worksheets = worksheets; this.selected = selected; this.warning = warning; this.date1904 = date1904; }
    }
    static final class GraphFailure extends IOException {
        final int status;
        GraphFailure(int status) { super(message(status)); this.status = status; }
        private static String message(int status) {
            if (status == 401) return "Microsoft sign-in expired. Reconnect your Microsoft account.";
            if (status == 403) return "Microsoft has not allowed this app to read the rota. Check workbook access and your organisation’s consent policy.";
            if (status == 404) return "The Excel workbook or worksheet was not found. Check the link and worksheet name.";
            if (status == 429) return "Microsoft is busy. Please refresh again in a little while.";
            return "Microsoft could not read this Excel rota. Check your connection and workbook settings.";
        }
    }
    private WorkScheduleGraph() { }
    static Result fetch(String accessToken, JSONObject config) throws Exception {
        String drive = config.optString("driveId"), item = config.optString("itemId");
        if (drive.isEmpty() || item.isEmpty()) {
            JSONObject resolved = json(GRAPH + "/shares/" + WorkSchedulePolicy.sharingToken(config.getString("workbookLink")) + "/driveItem?$select=id,parentReference,file,name", accessToken);
            drive = resolved.optJSONObject("parentReference") == null ? "" : resolved.getJSONObject("parentReference").optString("driveId");
            item = resolved.optString("id");
            String name = resolved.optString("name");
            if (!name.toLowerCase(java.util.Locale.ROOT).endsWith(".xlsx")) throw new IOException("Choose an .xlsx Excel rota workbook.");
        }
        if (drive.isEmpty() || item.isEmpty()) throw new IOException("Microsoft did not return a readable Excel file. You can use its drive and item IDs in setup.");
        String base = GRAPH + "/drives/" + encode(drive) + "/items/" + encode(item);
        try {
            JSONArray sheetRows = json(base + "/workbook/worksheets?$select=id,name,visibility", accessToken).getJSONArray("value");
            List<String> names = new ArrayList<>(); String selected = config.optString("worksheet"), selectedId = "";
            for (int i = 0; i < sheetRows.length(); i++) {
                JSONObject sheet = sheetRows.getJSONObject(i); String name = sheet.optString("name");
                if ("VeryHidden".equalsIgnoreCase(sheet.optString("visibility"))) continue;
                names.add(name); if (selected.isEmpty()) selected = name;
                if (selected.equals(name)) selectedId = sheet.optString("id");
            }
            if (selectedId.isEmpty()) throw new IOException("Worksheet was not found. Check its exact name.");
            JSONObject range = json(base + "/workbook/worksheets/" + encode(selectedId) + "/usedRange(valuesOnly=true)?$select=values,text", accessToken);
            JSONArray values = range.getJSONArray("values"), display = range.optJSONArray("text");
            if (values.length() > 5000) throw new IOException("Rota exceeds 5,000 rows. Use a smaller worksheet.");
            List<List<Object>> rows = new ArrayList<>();
            for (int r = 0; r < values.length(); r++) {
                JSONArray cells = values.getJSONArray(r); if (cells.length() > 120) throw new IOException("Rota exceeds 120 columns.");
                List<Object> row = new ArrayList<>();
                for (int c = 0; c < cells.length(); c++) {
                    Object value = cells.opt(c); if (value == JSONObject.NULL) value = "";
                    if (value instanceof Number && ((Number) value).doubleValue() >= 10000 && ((Number) value).doubleValue() <= 109574) {
                        // Text dates are interpreted by Excel's own 1900/1904 system. If formatting
                        // cannot identify them, inspect workbook.xml rather than guessing its epoch.
                        JSONArray formattedRow = display == null ? null : display.optJSONArray(r);
                        String date = formattedRow == null ? "" : isoDate(formattedRow.optString(c));
                        if (date.isEmpty()) return xlsx(base, accessToken, config);
                        value = date;
                    }
                    if (!(value instanceof Number) && !(value instanceof String) && !(value instanceof Boolean)) value = ""; if (value.toString().length() > 2000) throw new IOException("Excel cell is too long."); row.add(value);
                }
                rows.add(row);
            }
            return new Result(rows, names, selected, "", false);
        } catch (GraphFailure failure) {
            if (failure.status != 403 && failure.status != 400 && failure.status != 405 && failure.status != 501) throw failure;
            // Excel's workbook API can demand Files.ReadWrite even for GET. Keep read-only scopes
            // and decode the XLSX obtained with the read-only Graph content endpoint instead.
            return xlsx(base, accessToken, config);
        }
    }
    private static Result xlsx(String base, String token, JSONObject config) throws Exception {
        byte[] bytes = download(base + "/content", token, config.optString("workbookLink"));
        RotaWorkbookReader.Result parsed = RotaWorkbookReader.read(bytes, config.optString("worksheet"));
        return new Result(parsed.rows, parsed.worksheets, parsed.selected, "Read directly from Excel through Microsoft Graph with read-only access.", parsed.date1904);
    }
    private static String isoDate(String display) {
        if (display == null || display.length() > 100) return "";
        String value = display.trim();
        for (String pattern : new String[]{"uuuu-MM-dd", "d/M/uuuu", "d/M/uu", "d-M-uuuu", "d-M-uu", "d.M.uuuu", "d MMM uuuu", "d-MMM-uuuu", "d-MMM-uu", "EEE d MMM uuuu", "EEE, d MMM uuuu"}) {
            try { java.time.format.DateTimeFormatter formatter = new java.time.format.DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern(pattern).toFormatter(java.util.Locale.UK).withResolverStyle(java.time.format.ResolverStyle.STRICT); return java.time.LocalDate.parse(value, formatter).toString(); } catch (Exception ignored) { }
        }
        return "";
    }
    private static String encode(String text) throws Exception { return URLEncoder.encode(text, "UTF-8").replace("+", "%20"); }
    private static JSONObject json(String url, String token) throws Exception {
        HttpURLConnection connection = open(url, token);
        try { int status = connection.getResponseCode(); if (status < 200 || status >= 300) throw new GraphFailure(status); return new JSONObject(new String(read(connection.getInputStream(), 12 * 1024 * 1024), StandardCharsets.UTF_8)); }
        finally { connection.disconnect(); }
    }
    private static HttpURLConnection open(String url, String token) throws Exception {
        URI uri = URI.create(url); if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getPort() != -1) throw new IOException("Unsafe Microsoft URL.");
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection(); connection.setRequestMethod("GET"); connection.setConnectTimeout(15000); connection.setReadTimeout(20000); connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept", "application/json");
        if (token != null) { if (!"graph.microsoft.com".equalsIgnoreCase(uri.getHost())) throw new IOException("Microsoft token cannot be sent to this host."); connection.setRequestProperty("Authorization", "Bearer " + token); }
        return connection;
    }
    private static byte[] download(String url, String token, String sourceLink) throws Exception {
        String sourceHost = URI.create(sourceLink).getHost(); String target = url;
        for (int redirects = 0; redirects <= 3; redirects++) {
            String host = URI.create(target).getHost();
            boolean graph = "graph.microsoft.com".equalsIgnoreCase(host);
            boolean sharepoint = host != null && host.toLowerCase(java.util.Locale.ROOT).endsWith(".sharepoint.com");
            boolean oneDrive = host != null && (host.toLowerCase(java.util.Locale.ROOT).endsWith(".files.1drv.com") || host.equalsIgnoreCase("onedrive.live.com"));
            if (!graph && !sharepoint && !oneDrive && (sourceHost == null || !sourceHost.equalsIgnoreCase(host))) throw new IOException("Microsoft returned an unexpected download host.");
            HttpURLConnection connection = open(target, graph ? token : null);
            try {
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) { String location = connection.getHeaderField("Location"); if (location == null) throw new IOException("Microsoft download redirect is missing."); target = URI.create(target).resolve(location).toString(); continue; }
                if (status < 200 || status >= 300) throw new GraphFailure(status);
                if (connection.getContentLengthLong() > 15 * 1024 * 1024) throw new IOException("Excel file exceeds 15 MB. Use a smaller rota workbook.");
                return read(connection.getInputStream(), 15 * 1024 * 1024);
            } finally { connection.disconnect(); }
        }
        throw new IOException("Microsoft download redirected too many times.");
    }
    private static byte[] read(InputStream stream, int limit) throws IOException {
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count; while ((count = input.read(buffer)) != -1) { if (output.size() + count > limit) throw new IOException("Microsoft response is too large."); output.write(buffer, 0, count); } return output.toByteArray();
        }
    }
}
