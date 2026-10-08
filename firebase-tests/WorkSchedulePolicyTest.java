package app.usspace.couple.v012;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Runs production work validation + real zipped Excel parsing, without credentials or Android APIs. */
public final class WorkSchedulePolicyTest {
    private static int assertions;
    private interface Checked { void run() throws Exception; }
    private static void check(boolean value, String message) { assertions++; if (!value) throw new AssertionError(message); }
    private static void eq(Object actual, Object expected, String message) { check(expected.equals(actual), message + ": got " + actual); }
    private static void rejects(Checked attempt, String message) throws Exception {
        assertions++; try { attempt.run(); } catch (Exception expected) { return; } throw new AssertionError(message);
    }
    private static final String NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static final String REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static long serial(String date) { return java.time.temporal.ChronoUnit.DAYS.between(LocalDate.of(1899,12,30), LocalDate.parse(date)); }
    private static String xml(String value) { return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }
    private static String inline(String reference, String value) { return "<c r=\"" + reference + "\" t=\"inlineStr\"><is><t>" + xml(value) + "</t></is></c>"; }
    private static String numeric(String reference, double value) { return "<c r=\"" + reference + "\"><v>" + value + "</v></c>"; }
    private static String shared(String reference, int index) { return "<c r=\"" + reference + "\" t=\"s\"><v>" + index + "</v></c>"; }
    private static String worksheet(String body) { return "<?xml version=\"1.0\"?><worksheet xmlns=\"" + NS + "\"><sheetData>" + body + "</sheetData></worksheet>"; }
    private static Map<String,String> fixture(boolean date1904) {
        Map<String,String> files = new LinkedHashMap<>();
        files.put("xl/workbook.xml", "<workbook xmlns=\"" + NS + "\" xmlns:r=\"" + REL + "\"><workbookPr date1904=\"" + (date1904 ? "1" : "0") + "\"/><sheets><sheet name=\"Rota\" sheetId=\"1\" r:id=\"rId1\"/><sheet name=\"Archive\" sheetId=\"2\" r:id=\"rId2\"/></sheets></workbook>");
        files.put("xl/_rels/workbook.xml.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"" + REL + "/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"" + REL + "/worksheet\" Target=\"/xl/worksheets/sheet2.xml\"/></Relationships>");
        // Rich strings are concatenated exactly as Excel displays them.
        files.put("xl/sharedStrings.xml", "<sst xmlns=\"" + NS + "\"><si><t>Date</t></si><si><t>Name</t></si><si><r><t>Alameen </t></r><r><t>Ashraf</t></r></si><si><t>Alice Smith</t></si></sst>");
        String header = shared("A1",0) + shared("C1",1) + inline("D1","Start time") + inline("E1","End time") + inline("F1","Location") + inline("G1","Tutorial room") + inline("H1","Simulation") + inline("I1","Shift");
        long day = serial("2026-10-12") - (date1904 ? 1462 : 0);
        String own = numeric("A2",day) + shared("C2",2) + numeric("D2",8.0/24) + numeric("E2",17.0/24) + inline("F2","Golden Jubilee & ward") + inline("G2","Private room 4") + inline("H2","Private simulation session") + inline("I2","Private rota notes");
        String coworker = numeric("A3",day) + shared("C3",3) + numeric("D3",9.0/24) + numeric("E3",18.0/24) + inline("F3","COWORKER SECRET") + inline("I3","COWORKER PRIVATE DUTY");
        files.put("xl/worksheets/sheet1.xml", worksheet("<row r=\"1\">" + header + "</row><row r=\"2\">" + own + "</row><row r=\"3\">" + coworker + "</row>"));
        files.put("xl/worksheets/sheet2.xml", worksheet("<row r=\"1\">" + inline("A1","Date") + inline("B1","Name") + inline("C1","Shift") + "</row><row r=\"2\">" + inline("A2","2026-10-12") + inline("B2","Alice Smith") + inline("C2","ARCHIVE COWORKER ONLY") + "</row>"));
        return files;
    }
    private static byte[] zip(Map<String,String> files) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) { for (Map.Entry<String,String> file : files.entrySet()) {
            zip.putNextEntry(new ZipEntry(file.getKey())); zip.write(file.getValue().getBytes(StandardCharsets.UTF_8)); zip.closeEntry();
        } }
        return bytes.toByteArray();
    }
    private static RotaParser.Config person(boolean date1904) { RotaParser.Config config = new RotaParser.Config(); config.person = "Alameen Ashraf"; config.date1904 = date1904; return config; }
    private static String column(long oneBased) { StringBuilder result = new StringBuilder(); while (oneBased > 0) { oneBased--; result.append((char)('A' + oneBased % 26)); oneBased /= 26; } return result.reverse().toString(); }

    private static boolean accepts(String[] callback) {
        return WorkSchedulePolicy.acceptOAuthCallback(callback[0],callback[1],callback[2],callback[3],callback[4],callback[5],callback[6],callback[7],callback[8],callback[9]);
    }
    private static void oauthTests() {
        String state = "a-unique-pkce-session-state-for-this-request";
        String client = "12345678-1234-1234-1234-123456789abc";
        String redirect = "app.usspace.couple.v012://oauth2redirect";
        String authorize = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
        String token = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
        String[] request = {state,state,client,client,redirect,redirect,authorize,authorize,token,token};
        check(accepts(request),"Correct OAuth result is bound to every original request field");
        for (int index=0;index<request.length;index++) {
            String[] missing = request.clone(); missing[index] = null; check(!accepts(missing),"Missing OAuth field " + index + " must reject callback");
            String[] changed = request.clone(); changed[index] = index < 2 ? "different-unique-state-value" : index < 4 ? "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" : index < 6 ? "other.app://oauth2redirect" : "https://login.microsoftonline.com/organizations/oauth2/v2.0/" + (index < 8 ? "authorize" : "token");
            check(!accepts(changed),"Changed OAuth state/client/redirect/endpoint at " + index + " must reject callback");
        }
        String[] shortState = request.clone(); shortState[0] = shortState[1] = "too-short"; check(!accepts(shortState),"Weak/missing stored OAuth state is not accepted");
        String[] wrongClient = request.clone(); wrongClient[2] = wrongClient[3] = "not-an-entra-guid"; check(!accepts(wrongClient),"Even matching malformed client ID rejected");
        for (String badRedirect : Arrays.asList("https://attacker.example/callback","other.app://oauth2redirect","app.usspace.couple.v012://otherredirect")) { String[] bad = request.clone(); bad[4] = bad[5] = badRedirect; check(!accepts(bad),"Callback destination must be the registered app scheme"); }
        for (String host : Arrays.asList("http://login.microsoftonline.com","https://attacker.example","https://login.microsoftonline.com.attacker.example","https://user:password@login.microsoftonline.com")) {
            String[] badAuthorize = request.clone(); badAuthorize[6] = badAuthorize[7] = host + "/common/oauth2/v2.0/authorize"; check(!accepts(badAuthorize),"Matching non-Microsoft/insecure authorize endpoint rejected");
            String[] badToken = request.clone(); badToken[8] = badToken[9] = host + "/common/oauth2/v2.0/token"; check(!accepts(badToken),"Matching non-Microsoft/insecure token endpoint rejected");
        }
        String[] wrongEndpoint = request.clone(); wrongEndpoint[6] = wrongEndpoint[7] = token; check(!accepts(wrongEndpoint),"Token endpoint cannot stand in for authorize endpoint");
        wrongEndpoint = request.clone(); wrongEndpoint[8] = wrongEndpoint[9] = authorize; check(!accepts(wrongEndpoint),"Authorize endpoint cannot stand in for token endpoint");
    }

    public static void main(String[] args) throws Exception {
        String link = "https://example.sharepoint.com/:x:/s/Example/IEXAMPLE?email=al%40example.com&e=read";
        for (String valid : Arrays.asList(link, "https://tenant.sharepoint.com/sites/team/Shared%20Documents/rota.xlsx", "https://1drv.ms/x/s!example", "https://onedrive.live.com/?cid=123")) check(WorkSchedulePolicy.validLink(valid), "Valid read-only sharing link rejected");
        for (String invalid : Arrays.asList("http://tenant.sharepoint.com/rota.xlsx", "javascript:alert(1)", "file:///tmp/rota.xlsx", "https://sharepoint.com.evil.example/rota.xlsx", "https://tenant.sharepoint.com.evil.example/rota.xlsx", "https://evil.example/tenant.sharepoint.com", "https://user:password@tenant.sharepoint.com/rota.xlsx", "https://tenant.sharepoint.com:443/rota.xlsx", "https://tenant.sharepoint.com:9999/rota.xlsx", "https://sharepoint.com/rota.xlsx", "https://tenant.sharepoint.com/" + "x".repeat(4096), "", "not a link")) check(!WorkSchedulePolicy.validLink(invalid), "Unsafe link accepted: " + invalid.substring(0,Math.min(80,invalid.length())));
        check(!WorkSchedulePolicy.validLink(null), "Null link accepted");
        String token = WorkSchedulePolicy.sharingToken(link); check(token.startsWith("u!"), "Graph sharing token prefix"); check(token.substring(2).matches("[A-Za-z0-9_-]+"), "URL-safe no-padding sharing token"); eq(new String(Base64.getUrlDecoder().decode(token.substring(2)), StandardCharsets.UTF_8),link,"Graph sharing token round-trips exact URL");
        rejects(() -> WorkSchedulePolicy.sharingToken("https://attacker.example/rota.xlsx"), "Sharing token must validate host");
        check(WorkSchedulePolicy.validClientId("12345678-1234-1234-1234-123456789abc"), "Valid Entra application GUID"); check(WorkSchedulePolicy.validClientId("ABCDEF12-1234-1234-1234-ABCDEF123456"), "Uppercase GUID");
        for (String invalid : Arrays.asList("", "not-a-guid", "12345678-1234-1234-1234-123456789abg", "12345678-1234-1234-1234-123456789abc/extra")) check(!WorkSchedulePolicy.validClientId(invalid),"Invalid client ID accepted"); check(!WorkSchedulePolicy.validClientId(null), "Null client ID accepted");
        for (String valid : Arrays.asList("common","organizations","12345678-1234-1234-1234-123456789abc","example.onmicrosoft.com")) check(WorkSchedulePolicy.validTenant(valid),"Valid tenant rejected");
        for (String invalid : Arrays.asList("", "https://attacker.example", "../organizations", "example.onmicrosoft.com/evil", "example.onmicrosoft.com?evil", "evil.example")) check(!WorkSchedulePolicy.validTenant(invalid),"Invalid tenant accepted"); check(!WorkSchedulePolicy.validTenant(null),"Null tenant accepted");
        for (String valid : Arrays.asList("00:00","08:00","17:30","23:59")) check(WorkSchedulePolicy.validTime(valid),"Valid local clock rejected");
        for (String invalid : Arrays.asList("8:00","24:00","17:60","-1:00","08:00:00","08:00Z","")) check(!WorkSchedulePolicy.validTime(invalid),"Invalid clock accepted"); check(!WorkSchedulePolicy.validTime(null),"Null clock accepted");
        for (String valid : Arrays.asList("2026-10-12","2028-02-29","2000-01-01","2100-12-31")) check(WorkSchedulePolicy.validDate(valid),"Valid rota date rejected");
        for (String invalid : Arrays.asList("2026-02-29","2026-02-30","2026-13-01","12/10/2026","2026-1-2","1999-12-31","2101-01-01","")) check(!WorkSchedulePolicy.validDate(invalid),"Invalid rota date accepted"); check(!WorkSchedulePolicy.validDate(null),"Null rota date accepted");
        check(WorkSchedulePolicy.validZone("Europe/London"),"UK timezone rejected"); check(WorkSchedulePolicy.validZone("Asia/Kolkata"),"Partner timezone rejected"); check(!WorkSchedulePolicy.validZone("MadeUp/London"),"Invented timezone accepted"); check(!WorkSchedulePolicy.validZone(null),"Null timezone accepted");
        oauthTests();
        LocalDate today = LocalDate.of(2026,10,12);
        Map<String,Object> summary = WorkSchedulePolicy.summary("authenticated-al-uid","authenticated-current-couple","2026-10-12","08:00","17:00","Europe/London",today);
        check(summary != null,"Own current-day complete shift can be shared"); eq(summary.keySet(),Set.of("uid","coupleId","date","start","end","timeZone","enabled"),"Partner summary contains exactly the seven approved fields"); eq(summary.get("uid"),"authenticated-al-uid","Uses authenticated UID"); eq(summary.get("coupleId"),"authenticated-current-couple","Uses current verified couple"); eq(summary.get("enabled"),Boolean.TRUE,"Explicit enabled marker");
        check(WorkSchedulePolicy.summary("uid","cid","2026-10-13","08:00","17:00","Europe/London",today) == null,"Future rota must not become current partner status");
        check(WorkSchedulePolicy.summary("uid","cid","2026-10-11","08:00","17:00","Europe/London",today) == null,"Stale rota must not become current partner status");
        check(WorkSchedulePolicy.summary(null,"cid","2026-10-12","08:00","17:00","Europe/London",today) == null,"No unauthenticated summary"); check(WorkSchedulePolicy.summary("uid","","2026-10-12","08:00","17:00","Europe/London",today) == null,"No unpaired summary");
        for (String bad : Arrays.asList("","PRIVATE NOTES","25:00")) check(WorkSchedulePolicy.summary("uid","cid","2026-10-12",bad,"17:00","Europe/London",today) == null,"Summary requires a complete valid start");
        check(WorkSchedulePolicy.summary("uid","cid","2026-10-12","08:00","","Europe/London",today) == null,"Summary requires a complete end"); check(WorkSchedulePolicy.summary("uid","cid","2026-10-12","08:00","17:00","MadeUp/London",today) == null,"Summary requires real timezone");
        check(WorkSchedulePolicy.summary("uid","cid","2026-10-12","20:00","08:00","Europe/London",today) != null,"Overnight shift retains meaningful local times");
        check(WorkSchedulePolicy.summary("uid","cid","2026-10-12","08:00","17:00","Europe/London",null) == null,"Missing trusted today does not throw or share a schedule");

        RotaWorkbookReader.Result workbook = RotaWorkbookReader.read(zip(fixture(false)),"");
        eq(workbook.selected,"Rota","Default is first readable worksheet"); eq(workbook.worksheets,Arrays.asList("Rota","Archive"),"Exact worksheet discovery"); check(!workbook.date1904,"1900 epoch default"); eq(workbook.rows.size(),3,"Actual XML rows decoded"); eq(workbook.rows.get(0).get(1),"","Sparse B column retained"); eq(workbook.rows.get(1).get(2),"Alameen Ashraf","Rich shared strings concatenate"); check(workbook.rows.get(1).get(3) instanceof Number,"Numeric clock remains numeric for Excel parser");
        RotaParser.Result parsed = RotaParser.parse(workbook.rows,person(workbook.date1904)); check(parsed.success,"Real XLSX feeds production rota parser"); eq(parsed.shifts.size(),1,"Only Al's row imported from own + coworker worksheet"); RotaParser.Shift own = parsed.shifts.get(0); eq(own.date,"2026-10-12","XLSX numeric date"); eq(own.start,"08:00","XLSX fractional start"); eq(own.end,"17:00","XLSX fractional end"); eq(own.location,"Golden Jubilee & ward","Inline XML entity decoded"); eq(own.tutorialRoom,"Private room 4","Private owner tutorial imported");
        summary = WorkSchedulePolicy.summary("authenticated-al-uid","authenticated-current-couple",own.date,own.start,own.end,"Europe/London",today);
        check(summary != null,"Real parsed own shift yields optional minimal summary"); String projection = summary.toString();
        for (String privateValue : Arrays.asList("Private rota notes","Golden Jubilee","Private room","Private simulation","COWORKER","health","cycle","notes","location","tutorialRoom","simulation","accessToken","refreshToken","workbook","rows")) check(!projection.contains(privateValue),"Private rota fields or credentials leaked into partner summary: " + privateValue);
        workbook = RotaWorkbookReader.read(zip(fixture(true))," Rota "); check(workbook.date1904,"1904 workbook flag decoded"); parsed = RotaParser.parse(workbook.rows,person(workbook.date1904)); check(parsed.success,"1904 real XLSX parses"); eq(parsed.shifts.get(0).date,"2026-10-12","1904 numeric XLSX uses correct date epoch"); eq(parsed.shifts.get(0).start,"08:00","1904 XLSX does not alter fractional times");
        workbook = RotaWorkbookReader.read(zip(fixture(false)),"Archive"); eq(workbook.selected,"Archive","Explicit worksheet selected"); check(!RotaParser.parse(workbook.rows,person(false)).success,"Coworker-only worksheet cannot import a personal rota");
        rejects(() -> RotaWorkbookReader.read(zip(fixture(false)),"Nonexistent"),"Wrong worksheet must fail clearly"); rejects(() -> RotaWorkbookReader.read(zip(fixture(false)),"rota"),"Worksheet identity remains exact");
        rejects(() -> RotaWorkbookReader.read(new byte[]{1,2,3},""),"Non-XLSX bytes rejected"); rejects(() -> RotaWorkbookReader.read(null,""),"Null XLSX rejected");
        Map<String,String> hostile = fixture(false); hostile.put("../outside.xml","not extracted"); rejects(() -> RotaWorkbookReader.read(zip(hostile),""),"Archive traversal path rejected");
        Map<String,String> absolute = fixture(false); absolute.put("/xl/untrusted.xml","x"); rejects(() -> RotaWorkbookReader.read(zip(absolute),""),"Absolute archive path rejected");
        Map<String,String> backslash = fixture(false); backslash.put("xl\\outside.xml","x"); rejects(() -> RotaWorkbookReader.read(zip(backslash),""),"Windows archive traversal rejected");
        Map<String,String> doctype = fixture(false); doctype.put("xl/workbook.xml","<!DOCTYPE workbook [<!ENTITY label 'do not expand'>]>" + doctype.get("xl/workbook.xml")); rejects(() -> RotaWorkbookReader.read(zip(doctype),""),"Workbook DOCTYPE rejected");
        Map<String,String> entity = fixture(false); entity.put("xl/worksheets/sheet1.xml","<!DOCTYPE worksheet [<!ENTITY secret SYSTEM 'file:///tmp/usspace-not-a-real-fixture-secret'>]>" + worksheet("<row>" + inline("A1","Date") + "<c r=\"B1\" t=\"inlineStr\"><is><t>&secret;</t></is></c></row>")); rejects(() -> RotaWorkbookReader.read(zip(entity),""),"Worksheet external entity rejected");
        Map<String,String> tooWide = fixture(false); tooWide.put("xl/worksheets/sheet1.xml",worksheet("<row>" + inline(column(121) + "1","not allowed") + "</row>")); rejects(() -> RotaWorkbookReader.read(zip(tooWide),""),"Column 121 rejected");
        Map<String,String> largeCell = fixture(false); largeCell.put("xl/worksheets/sheet1.xml",worksheet("<row>" + inline("A1","x".repeat(2001)) + "</row>")); rejects(() -> RotaWorkbookReader.read(zip(largeCell),""),"Oversized inline cell rejected");
        Map<String,String> largeShared = fixture(false); largeShared.put("xl/sharedStrings.xml","<sst xmlns=\"" + NS + "\"><si><t>" + "x".repeat(2001) + "</t></si></sst>"); rejects(() -> RotaWorkbookReader.read(zip(largeShared),""),"Oversized shared cell rejected");
        Map<String,String> badShared = fixture(false); badShared.put("xl/worksheets/sheet1.xml",worksheet("<row>" + shared("A1",99999) + "</row>")); rejects(() -> RotaWorkbookReader.read(zip(badShared),""),"Invalid shared string reference rejected");
        Map<String,String> externalSheet = fixture(false); externalSheet.put("xl/_rels/workbook.xml.rels","<Relationships><Relationship Id=\"rId1\" Target=\"https://attacker.example/rota.xml\" TargetMode=\"External\"/></Relationships>"); rejects(() -> RotaWorkbookReader.read(zip(externalSheet),""),"No external relationship fetch");
        StringBuilder excessiveRows = new StringBuilder(); for (int i=0;i<5001;i++) excessiveRows.append("<row/>"); Map<String,String> tooTall = fixture(false); tooTall.put("xl/worksheets/sheet1.xml",worksheet(excessiveRows.toString())); rejects(() -> RotaWorkbookReader.read(zip(tooTall),""),"Worksheet row limit enforced");
        Map<String,String> overflow = fixture(false); overflow.put("xl/worksheets/sheet1.xml",worksheet("<row>" + inline(column(4294967297L) + "1","overflow cannot alias column A") + "</row>")); rejects(() -> RotaWorkbookReader.read(zip(overflow),""),"Huge column reference cannot overflow into valid A column");
        Map<String,String> veryLongColumn = fixture(false); veryLongColumn.put("xl/worksheets/sheet1.xml",worksheet("<row>" + inline("A".repeat(1000) + "1","invalid") + "</row>")); rejects(() -> RotaWorkbookReader.read(zip(veryLongColumn),""),"Huge column name fails before accumulator overflow");
        Map<String,String> maximumColumn = fixture(false); maximumColumn.put("xl/worksheets/sheet1.xml",worksheet("<row>" + inline(column(120) + "1","last safe column") + "</row>")); workbook = RotaWorkbookReader.read(zip(maximumColumn),""); eq(workbook.rows.get(0).size(),120,"Exactly 120 columns allowed"); eq(workbook.rows.get(0).get(119),"last safe column","120th column preserved");
        Map<String,String> missingStructure = fixture(false); missingStructure.remove("xl/workbook.xml"); rejects(() -> RotaWorkbookReader.read(zip(missingStructure),""),"Missing workbook structure rejected");
        Map<String,String> tooManyEntries = fixture(false); for (int i=0;i<1996;i++) tooManyEntries.put("extras/" + i,"x"); rejects(() -> RotaWorkbookReader.read(zip(tooManyEntries),""),"Archive entry bound enforced");
        rejects(() -> RotaWorkbookReader.read(new byte[15*1024*1024+1],""),"Compressed file size bound enforced before parsing");
        Map<String,String> traversalRelation = fixture(false); traversalRelation.put("xl/_rels/workbook.xml.rels","<Relationships><Relationship Id=\"rId1\" Target=\"../../outside.xml\"/></Relationships>"); rejects(() -> RotaWorkbookReader.read(zip(traversalRelation),""),"Worksheet relationship cannot traverse outside workbook");
        Map<String,String> true1904 = fixture(true); true1904.put("xl/workbook.xml",true1904.get("xl/workbook.xml").replace("date1904=\"1\"","date1904=\"true\"")); check(RotaWorkbookReader.read(zip(true1904),"").date1904,"Boolean 1904 epoch spelling decoded");
        System.out.println("WORK_SCHEDULE_POLICY_TEST_OK (" + assertions + " assertions: SharePoint links, OAuth callback binding, minimal current-day projection and real bounded XLSX decoding)");
    }
}
