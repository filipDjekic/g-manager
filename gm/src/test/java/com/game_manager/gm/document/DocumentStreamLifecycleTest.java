package com.game_manager.gm.document;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.game_manager.gm.audit.AuditWriter;
import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.document.storage.*;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.*;
import java.time.Clock;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class DocumentStreamLifecycleTest {
    @Test
    void closesValidationAndStorageStreamsOnSuccessAndMimeRejection() throws Exception {
        DocumentRepository documents = mock(DocumentRepository.class);
        DocumentVersionRepository versions = mock(DocumentVersionRepository.class);
        DocumentStorage storage = mock(DocumentStorage.class);
        CurrentUserProvider current = mock(CurrentUserProvider.class);
        UUID owner = UUID.randomUUID();
        when(current.requireCurrentUser()).thenReturn(new AuthenticatedUser(owner, "test@example.test", Role.CUSTOMER));
        GManagerProperties config = mock(GManagerProperties.class);
        when(config.documents()).thenReturn(new GManagerProperties.Documents(5242880, 20, 30, "local", null, null, null, null, null));
        when(documents.saveAndFlush(any())).thenAnswer(invocation -> {
            Document document = invocation.getArgument(0); document.setId(UUID.randomUUID()); document.setVersion(0L); return document;
        });
        when(storage.store(anyString(), any(), anyLong())).thenAnswer(invocation ->
                new StoredObject(invocation.getArgument(0), 7, "checksum"));
        DocumentService service = new DocumentService(documents, versions, storage, current, mock(DocumentPolicy.class),
                config, mock(AuditWriter.class), new SimpleMeterRegistry(), Clock.systemUTC());
        TrackingFile valid = new TrackingFile("text/plain", "content");
        service.upload("GENERAL", owner, valid);
        assertThat(valid.open.get()).isZero();
        assertThat(valid.opened.get()).isEqualTo(2);
        TrackingFile rejected = new TrackingFile("application/pdf", "invalid");
        assertThatThrownBy(() -> service.upload("GENERAL", owner, rejected)).isInstanceOf(ApplicationException.class);
        assertThat(rejected.open.get()).isZero();
    }

    private static final class TrackingFile extends MockMultipartFile {
        private final AtomicInteger open = new AtomicInteger();
        private final AtomicInteger opened = new AtomicInteger();
        TrackingFile(String type, String content) { super("file", "test.txt", type, content.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
        @Override public InputStream getInputStream() throws IOException {
            open.incrementAndGet(); opened.incrementAndGet();
            return new FilterInputStream(super.getInputStream()) {
                @Override public void close() throws IOException { super.close(); open.decrementAndGet(); }
            };
        }
    }
}
