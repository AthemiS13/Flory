// 06_sd.ino
// SD card helpers: init, list directory, read file, write file
// Designed to be called from the project's `setup()` for testing (sdTest()).

#include <SD.h>
#include <SPI.h>

// Chip select pin for SD card (D4 on many ESP32 boards)
const int SD_CS_PIN = 4;

// Provide an explicit API to wipe /app contents. Callers (network) should
// invoke `sdWipeApp()` when a manual wipe is requested.
void sdWipeApp() {
  sdWipeDirContents("/app");
}

// Initialize the SD card. Returns true on success.
bool sdInit() {
  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("SD init failed!");
    return false;
  }
  Serial.println("SD initialized.");
  // Ensure root folders exist
  if (!SD.exists("/app")) {
    SD.mkdir("/app");
  }
  if (!SD.exists("/log")) {
    SD.mkdir("/log");
  }
  return true;
}

// Write a text file to SD. Returns true on success.
bool sdWriteText(const char* path, const String &content) {
  File file = SD.open(path, FILE_WRITE);
  if (!file) {
    Serial.printf("Failed to open %s for writing\n", path);
    return false;
  }
  file.println(content);
  file.close();
  Serial.printf("Wrote to %s\n", path);
  return true;
}

// Read a text file from SD and print to Serial. Returns true on success.
bool sdReadText(const char* path) {
  File file = SD.open(path);
  if (!file) {
    Serial.printf("Failed to open %s for reading\n", path);
    return false;
  }
  Serial.printf("--- Begin %s ---\n", path);
  while (file.available()) {
    Serial.write(file.read());
  }
  Serial.println();
  Serial.printf("--- End %s ---\n", path);
  file.close();
  return true;
}

// List files in a directory (non-recursive)
void sdListDir(const char* dirname) {
  File root = SD.open(dirname);
  if (!root) {
    Serial.printf("Failed to open dir: %s\n", dirname);
    return;
  }
  if (!root.isDirectory()) {
    Serial.printf("Not a directory: %s\n", dirname);
    root.close();
    return;
  }
  File file = root.openNextFile();
  Serial.printf("Listing directory: %s\n", dirname);
  while (file) {
    if (file.isDirectory()) {
      Serial.print("  DIR : ");
      Serial.println(file.name());
    } else {
      Serial.print("  FILE: ");
      Serial.print(file.name());
      Serial.print("  SIZE: ");
      Serial.println(file.size());
    }
    file = root.openNextFile();
  }
  root.close();
}

// Recursively remove a directory's contents but leave the directory itself.
// Used to wipe /app contents quickly.
void sdWipeDirContents(const char *dirname) {
  File dir = SD.open(dirname);
  if (!dir) return;
  if (!dir.isDirectory()) { dir.close(); return; }
  File entry = dir.openNextFile();
  while (entry) {
    String childName = String(entry.name());
    // Build full path for child. Some SD implementations return a full
    // path from entry.name(), others return a short name. Normalize both.
    String childPath;
    if (childName.startsWith("/")) {
      childPath = childName;
    } else {
      childPath = String(dirname);
      if (!childPath.endsWith("/")) childPath += "/";
      childPath += childName;
    }

    if (entry.isDirectory()) {
      // recurse into subdir
      sdWipeDirContents(childPath.c_str());
      // remove the subdir itself
      SD.rmdir(childPath.c_str());
    } else {
      SD.remove(childPath.c_str());
    }
    entry.close();
    entry = dir.openNextFile();
  }
  dir.close();
}

// Quick test function: init SD, write and read /test.txt and list root
void sdTest() {
  if (!sdInit()) return;
  sdWriteText("/test.txt", String("Hello from ESP32!"));
  sdReadText("/test.txt");
  sdListDir("/");
}

// Brute-force upload handler for emergency drag&drop.
// Behavior:
// - The first incoming file (UPLOAD_FILE_START) will trigger wiping all contents
//   of `/app` (but keep the `/app` directory itself). This is intentional.
// - upload.filename should be the path relative to the SD root (e.g. "index.html"
//   or "_next/static/..." or "/index.html"). Leading slash is optional.
// - Files are streamed directly to SD to avoid holding them in RAM.
// - This intentionally avoids any handshake or complex protocol.
void sdHandleUpload(HTTPUpload &upload) {
  String filename = upload.filename;
  if (filename.length() == 0) return; // nothing to do
  // Ensure uploads go under /app. If caller provided an absolute path
  // not under /app, normalize to /app/<path>. If filename already
  // starts with "/app" keep it. Otherwise prefix "/app".
  if (!filename.startsWith("/")) filename = String("/") + filename;
  if (!filename.startsWith("/app/") && filename != "/app") {
    // prepend /app
    // avoid double slash when filename == "/"
    if (filename == "/") filename = String("/app/");
    else filename = String("/app") + filename;
  }

  if (upload.status == UPLOAD_FILE_START) {
    Serial.printf("Upload start: %s\n", filename.c_str());
    // ensure directories exist for the incoming file
    int lastSlash = filename.lastIndexOf('/');
    if (lastSlash > 0) {
      String dir = filename.substring(0, lastSlash);
      // iterate components and create as needed
      String accum = "";
      int start = 1; // skip leading /
      while (start < dir.length()) {
        int nextSlash = dir.indexOf('/', start);
        if (nextSlash == -1) nextSlash = dir.length();
        accum += "/" + dir.substring(start, nextSlash);
        if (!SD.exists(accum.c_str())) {
          SD.mkdir(accum.c_str());
        }
        start = nextSlash + 1;
      }
    }
    // create or truncate target file
    File f = SD.open(filename.c_str(), FILE_WRITE);
    if (f) f.close();
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    // stream append chunk
    File f = SD.open(filename.c_str(), FILE_APPEND);
    if (f) {
      f.write(upload.buf, upload.currentSize);
      f.close();
    } else {
      Serial.printf("Failed to append to %s\n", filename.c_str());
    }
  } else if (upload.status == UPLOAD_FILE_END) {
    Serial.printf("Upload complete: %s (%u bytes)\n", filename.c_str(), upload.totalSize);
    // if upload finished for a file, we don't reset sd_upload_started because
    // subsequent files in the same session are expected to be part of the same
    // drag-and-drop operation. Callers may reset sd_upload_started when appropriate
    // (for example after the HTTP request ends).
  }
}
