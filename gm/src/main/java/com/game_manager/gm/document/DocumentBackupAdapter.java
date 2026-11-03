package com.game_manager.gm.document;

import com.game_manager.gm.common.operations.BackupDocumentPort;
import com.game_manager.gm.document.storage.DocumentStorage;
import java.io.*;
import java.security.*;
import java.util.HexFormat;
import java.util.zip.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Exact referenced objects, independent of local/S3 storage. The caller holds the write barrier. */
@Component @RequiredArgsConstructor
public class DocumentBackupAdapter implements BackupDocumentPort {
    private final JdbcTemplate jdbc;private final DocumentStorage storage;
    @Override public void writeArchive(OutputStream output) throws IOException {
        // Do not close the HTTP stream. CRC and the stored object hash both protect the archive.
        ZipOutputStream zip=new ZipOutputStream(output);
        jdbc.query("SELECT object_key,checksum_sha256,size_bytes FROM document_versions ORDER BY id",(org.springframework.jdbc.core.RowCallbackHandler)row->{
            String key=row.getString("object_key");
            if(key==null||key.startsWith("/")||key.contains("..")||key.contains("\\"))throw new IllegalStateException("Unsafe backup object key");
            try(var input=storage.open(key)){
                var digest=MessageDigest.getInstance("SHA-256");zip.putNextEntry(new ZipEntry("objects/"+key));
                long size;try(var checked=new DigestInputStream(input,digest)){size=checked.transferTo(zip);}
                zip.closeEntry();
                if(size!=row.getLong("size_bytes")||!HexFormat.of().formatHex(digest.digest()).equalsIgnoreCase(row.getString("checksum_sha256")))throw new IOException("Backup object integrity check failed");
            }catch(IOException|NoSuchAlgorithmException e){throw new IllegalStateException("Document snapshot failed",e);}
        });
        zip.finish();zip.flush();
    }
}
