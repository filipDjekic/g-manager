package com.game_manager.gm.document.storage;
import java.io.*;
public interface DocumentStorage { StoredObject store(String key,InputStream input,long size); InputStream open(String key); void delete(String key); boolean exists(String key); }
