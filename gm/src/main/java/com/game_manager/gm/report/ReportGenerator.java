package com.game_manager.gm.report;

import com.game_manager.gm.common.error.ApplicationException;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class ReportGenerator {
    private final JdbcTemplate jdbc;

    public ReportGenerator(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Generated generate(ReportRequest request, UUID scopedUser) {
        Query query = query(request.getDefinitionKey(), request.getFiltersJson(), scopedUser);
        try {
            return switch (request.getFormat()) {
                case CSV -> csv(query);
                case XLSX -> xlsx(query);
                case PDF -> pdf(query);
            };
        } catch (IOException exception) {
            throw new ApplicationException(HttpStatus.INTERNAL_SERVER_ERROR, "Report rendering failed");
        }
    }

    private Generated csv(Query query) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        output.write(0xef); output.write(0xbb); output.write(0xbf);
        output.write((String.join(",", query.headers()) + "\r\n").getBytes(StandardCharsets.UTF_8));
        AtomicLong count = new AtomicLong();
        jdbc.query(query.sql(), statement -> bind(statement, query.args()), result -> {
            output.writeBytes((csvRow(row(result, query.headers().size())) + "\r\n").getBytes(StandardCharsets.UTF_8));
            count.incrementAndGet();
        });
        return new Generated(output.toByteArray(), "text/csv", "csv", count.get());
    }

    private Generated xlsx(Query query) throws IOException {
        AtomicLong count = new AtomicLong();
        try (SXSSFWorkbook workbook = new SXSSFWorkbook(100); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            workbook.setCompressTempFiles(true);
            Sheet sheet = workbook.createSheet("Report");
            Row header = sheet.createRow(0);
            for (int index = 0; index < query.headers().size(); index++) header.createCell(index).setCellValue(query.headers().get(index));
            jdbc.query(query.sql(), statement -> bind(statement, query.args()), result -> {
                Row target = sheet.createRow(Math.toIntExact(count.incrementAndGet()));
                List<String> values = row(result, query.headers().size());
                for (int index = 0; index < values.size(); index++) target.createCell(index).setCellValue(safe(values.get(index)));
            });
            workbook.write(output); workbook.dispose();
            return new Generated(output.toByteArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx", count.get());
        }
    }

    private Generated pdf(Query query) throws IOException {
        AtomicLong count = new AtomicLong();
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            PdfWriter writer = new PdfWriter(document, font);
            writer.line(String.join(" | ", query.headers()));
            try {
                jdbc.query(query.sql(), statement -> bind(statement, query.args()), result -> {
                    try { writer.line(String.join(" | ", row(result, query.headers().size()))); count.incrementAndGet(); }
                    catch (IOException exception) { throw new UncheckedIOException(exception); }
                });
            } catch (UncheckedIOException exception) { throw exception.getCause(); }
            writer.close(); document.save(output);
            return new Generated(output.toByteArray(), "application/pdf", "pdf", count.get());
        }
    }

    private Query query(String key, String filters, UUID scope) {
        String[] range = filters.split("\\|");
        Instant from = Instant.parse(range[0]); Instant to = Instant.parse(range[1]);
        String scopeOrder = scope == null ? "" : " AND o.customer_id=?";
        String scopeReservation = scope == null ? "" : " AND r.customer_id=?";
        List<Object> args = new ArrayList<>(List.of(from, to)); if (scope != null) args.add(scope.toString());
        return switch (key) {
            case "orders" -> new Query(List.of("id","created_at","status","total_price"),
                    "SELECT o.id,o.created_at,o.status,o.total_price FROM orders o WHERE o.created_at>=? AND o.created_at<?" + scopeOrder + " ORDER BY o.created_at,o.id", args);
            case "reservations" -> new Query(List.of("id","employee_id","start_time","end_time","status"),
                    "SELECT r.id,r.employee_id,r.start_time,r.end_time,r.status FROM reservations r WHERE r.start_time>=? AND r.start_time<?" + scopeReservation + " ORDER BY r.start_time,r.id", args);
            case "revenue" -> new Query(List.of("status","orders","revenue"),
                    "SELECT o.status,COUNT(*),COALESCE(SUM(o.total_price),0) FROM orders o WHERE o.created_at>=? AND o.created_at<?" + scopeOrder + " GROUP BY o.status ORDER BY o.status", args);
            case "workload" -> new Query(List.of("employee_id","reservations","minutes"),
                    "SELECT r.employee_id,COUNT(*),SUM(TIMESTAMPDIFF(MINUTE,r.start_time,r.end_time)) FROM reservations r WHERE r.start_time>=? AND r.start_time<?" + scopeReservation + " GROUP BY r.employee_id ORDER BY r.employee_id", args);
            default -> throw new ApplicationException(HttpStatus.BAD_REQUEST, "Unknown report definition");
        };
    }

    private static void bind(java.sql.PreparedStatement statement, List<Object> args) throws java.sql.SQLException { for (int i=0;i<args.size();i++) statement.setObject(i+1,args.get(i)); statement.setFetchSize(200); }
    private static List<String> row(ResultSet result, int columns) throws java.sql.SQLException { List<String> values=new ArrayList<>(); for(int i=1;i<=columns;i++)values.add(Objects.toString(result.getObject(i),"")); return values; }
    static String safe(String value) { return value != null && !value.isEmpty() && "=+-@\t\r".indexOf(value.charAt(0)) >= 0 ? "'" + value : Objects.toString(value, ""); }
    private static String csvRow(List<String> row) { return row.stream().map(ReportGenerator::safe).map(value -> "\"" + value.replace("\"", "\"\"") + "\"").reduce((a,b)->a+","+b).orElse(""); }
    public record Generated(byte[] bytes, String contentType, String extension, long rows) {
    }
    private record Query(List<String> headers, String sql, List<Object> args) {
    }
    private static final class PdfWriter { private final PDDocument doc; private final PDType1Font font; private PDPageContentStream stream; private float y; PdfWriter(PDDocument doc,PDType1Font font)throws IOException{this.doc=doc;this.font=font;page();} void page()throws IOException{if(stream!=null)stream.close();PDPage page=new PDPage(PDRectangle.A4);doc.addPage(page);stream=new PDPageContentStream(doc,page);stream.setFont(font,8);y=800;} void line(String text)throws IOException{if(y<40)page();stream.beginText();stream.newLineAtOffset(35,y);stream.showText(ascii(text).substring(0,Math.min(150,ascii(text).length())));stream.endText();y-=12;} void close()throws IOException{stream.close();} private static String ascii(String value){return value.replaceAll("[^\\x20-\\x7E]","?");}}
}
