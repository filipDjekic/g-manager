package com.game_manager.gm.document;
import java.io.InputStream;
public interface DocumentScanner { ScanResult scan(InputStream content,String contentType); record ScanResult(boolean clean,String detail){} }
