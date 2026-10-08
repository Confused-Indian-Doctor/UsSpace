package app.usspace.couple.v012;

import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.XMLReader;
import org.xml.sax.ext.DefaultHandler2;

import javax.xml.parsers.SAXParserFactory;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Read-only XLSX fallback for tenants whose workbook API requires write scopes for GETs. */
public final class RotaWorkbookReader {
    private static final int MAX_ZIP = 15 * 1024 * 1024, MAX_INFLATED = 30 * 1024 * 1024;
    private static final int MAX_ROWS = 5000, MAX_COLUMNS = 120, MAX_CELL = 2000;
    public static final class Result {
        public final List<List<Object>> rows; public final List<String> worksheets; public final String selected; public final boolean date1904;
        Result(List<List<Object>> rows, List<String> worksheets, String selected, boolean date1904) { this.rows = rows; this.worksheets = worksheets; this.selected = selected; this.date1904 = date1904; }
    }
    private RotaWorkbookReader() { }
    public static Result read(byte[] data, String worksheet) throws Exception {
        if (data == null || data.length > MAX_ZIP) throw new IOException("Excel file is too large. Use a smaller rota workbook.");
        Map<String, byte[]> files = new LinkedHashMap<>(); int inflated = 0, entries = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(data))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > 2000) throw new IOException("Excel archive has too many entries.");
                String name = entry.getName();
                if (name.startsWith("/") || name.contains("..") || name.contains("\\")) throw new IOException("Excel archive path is invalid.");
                ByteArrayOutputStream buffer = new ByteArrayOutputStream(); byte[] block = new byte[8192]; int count;
                while ((count = zip.read(block)) != -1) {
                    inflated += count; if (inflated > MAX_INFLATED) throw new IOException("Expanded Excel data is too large.");
                    if (name.startsWith("xl/") && (name.endsWith(".xml") || name.endsWith(".rels"))) buffer.write(block, 0, count);
                }
                if (name.startsWith("xl/") && (name.endsWith(".xml") || name.endsWith(".rels"))) files.put(name, buffer.toByteArray());
            }
        }
        Map<String, String> relationship = new LinkedHashMap<>();
        parse(required(files, "xl/_rels/workbook.xml.rels"), new SafeHandler() {
            @Override public void startElement(String uri, String local, String q, Attributes a) throws SAXException {
                if (tag(local, q).equals("Relationship")) {
                    if ("External".equals(a.getValue("TargetMode"))) return;
                    String id = a.getValue("Id"), target = a.getValue("Target");
                    if (id != null && target != null) {
                        String path = target.startsWith("/") ? target.substring(1) : Paths.get("xl").resolve(target).normalize().toString().replace('\\', '/');
                        if (path.startsWith("xl/worksheets/") && !path.contains("..")) relationship.put(id, path);
                    }
                }
            }
        });
        Map<String, String> sheets = new LinkedHashMap<>(); final boolean[] date1904 = {false};
        parse(required(files, "xl/workbook.xml"), new SafeHandler() {
            @Override public void startElement(String uri, String local, String q, Attributes a) {
                if (tag(local, q).equals("workbookPr")) { date1904[0] = "1".equals(a.getValue("date1904")) || "true".equalsIgnoreCase(a.getValue("date1904")); return; }
                if (!tag(local, q).equals("sheet")) return;
                String name = a.getValue("name"), id = a.getValue("r:id");
                if (id == null) id = a.getValue("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
                if (name != null && id != null && relationship.containsKey(id) && !"veryHidden".equals(a.getValue("state"))) sheets.put(name, relationship.get(id));
            }
        });
        if (sheets.isEmpty()) throw new IOException("No readable Excel worksheet was found.");
        String selected = worksheet == null || worksheet.trim().isEmpty() ? sheets.keySet().iterator().next() : worksheet.trim();
        if (!sheets.containsKey(selected)) throw new IOException("Worksheet was not found. Check its exact name.");
        List<String> strings = new ArrayList<>();
        if (files.containsKey("xl/sharedStrings.xml")) parse(files.get("xl/sharedStrings.xml"), new SafeHandler() {
            StringBuilder text; boolean capture;
            @Override public void startElement(String uri, String local, String q, Attributes a) throws SAXException {
                String name = tag(local, q); if (name.equals("si")) { if (strings.size() >= 150000) throw new SAXException("Too many Excel strings."); text = new StringBuilder(); }
                if (name.equals("t") && text != null) capture = true;
            }
            @Override public void characters(char[] ch, int start, int length) throws SAXException {
                if (capture && text != null) { if (text.length() + length > MAX_CELL) throw new SAXException("Excel cell text is too long."); text.append(ch, start, length); }
            }
            @Override public void endElement(String uri, String local, String q) {
                String name = tag(local, q); if (name.equals("t")) capture = false;
                if (name.equals("si") && text != null) { strings.add(text.toString()); text = null; }
            }
        });
        List<List<Object>> rows = new ArrayList<>();
        parse(required(files, sheets.get(selected)), new SafeHandler() {
            List<Object> row; int column, nextColumn; String type; StringBuilder value; boolean capture;
            @Override public void startElement(String uri, String local, String q, Attributes a) throws SAXException {
                String name = tag(local, q);
                if (name.equals("row")) { if (rows.size() >= MAX_ROWS) throw new SAXException("Rota exceeds 5,000 rows."); row = new ArrayList<>(); nextColumn = 0; }
                if (name.equals("c") && row != null) { column = column(a.getValue("r"), nextColumn); nextColumn = column + 1; type = a.getValue("t"); value = new StringBuilder(); }
                if ((name.equals("v") || name.equals("t")) && value != null) capture = true;
            }
            @Override public void characters(char[] ch, int start, int length) throws SAXException {
                if (capture && value != null) { if (value.length() + length > MAX_CELL) throw new SAXException("Excel cell is too long."); value.append(ch, start, length); }
            }
            @Override public void endElement(String uri, String local, String q) throws SAXException {
                String name = tag(local, q); if (name.equals("v") || name.equals("t")) capture = false;
                if (name.equals("c") && row != null && value != null) {
                    if (column < 0 || column >= MAX_COLUMNS) throw new SAXException("Rota exceeds 120 columns.");
                    while (row.size() <= column) row.add(""); Object cell = value.toString();
                    if ("s".equals(type)) { try { int index = Integer.parseInt(value.toString()); cell = strings.get(index); } catch (Exception e) { throw new SAXException("Excel shared string is invalid."); } }
                    else if (type == null || "n".equals(type)) { try { cell = Double.parseDouble(value.toString()); } catch (NumberFormatException ignored) { } }
                    row.set(column, cell); value = null;
                }
                if (name.equals("row") && row != null) { rows.add(row); row = null; }
            }
        });
        return new Result(rows, new ArrayList<>(sheets.keySet()), selected, date1904[0]);
    }
    private static int column(String reference, int fallback) {
        if (reference == null || !reference.matches("[A-Za-z]+[0-9]+")) return fallback;
        int value = 0; for (char letter : reference.toUpperCase(java.util.Locale.ROOT).toCharArray()) { if (letter < 'A' || letter > 'Z') break; if (value > MAX_COLUMNS) return MAX_COLUMNS; value = value * 26 + letter - 'A' + 1; }
        return value - 1;
    }
    private static byte[] required(Map<String, byte[]> files, String name) throws IOException { byte[] value = files.get(name); if (value == null) throw new IOException("Excel workbook structure is incomplete."); return value; }
    private static String tag(String local, String qualified) { return local == null || local.isEmpty() ? qualified.replaceFirst("^.*:", "") : local; }
    private static void parse(byte[] xml, SafeHandler handler) throws Exception {
        SAXParserFactory factory = SAXParserFactory.newInstance(); factory.setNamespaceAware(true);
        try { factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true); } catch (Exception ignored) { }
        try { factory.setFeature("http://xml.org/sax/features/external-general-entities", false); } catch (Exception ignored) { }
        try { factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false); } catch (Exception ignored) { }
        XMLReader reader = factory.newSAXParser().getXMLReader(); reader.setContentHandler(handler); reader.setEntityResolver(handler); reader.setErrorHandler(handler);
        reader.setProperty("http://xml.org/sax/properties/lexical-handler", handler);
        reader.parse(new InputSource(new ByteArrayInputStream(xml)));
    }
    private static class SafeHandler extends DefaultHandler2 {
        @Override public InputSource resolveEntity(String publicId, String systemId) throws SAXException { throw new SAXException("External Excel entities are not allowed."); }
        @Override public void startDTD(String name, String publicId, String systemId) throws SAXException { throw new SAXException("Excel DTDs are not allowed."); }
        @Override public void error(org.xml.sax.SAXParseException error) throws SAXException { throw error; }
        @Override public void fatalError(org.xml.sax.SAXParseException error) throws SAXException { throw error; }
    }
}
