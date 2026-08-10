package com.game_manager.gm.report;
import static org.assertj.core.api.Assertions.assertThat; import java.time.*; import org.junit.jupiter.api.Test;
class ReportScheduleTimeTest {@Test void respectsBusinessTimezoneAcrossDstGap(){Instant now=Instant.parse("2026-03-28T12:00:00Z");Instant next=ReportService.next("Europe/Belgrade",LocalTime.of(2,30),7,now);ZonedDateTime local=next.atZone(ZoneId.of("Europe/Belgrade"));assertThat(local.toLocalDate()).isEqualTo(LocalDate.of(2026,3,29));assertThat(local.getHour()).isEqualTo(3);assertThat(next).isAfter(now);}}
