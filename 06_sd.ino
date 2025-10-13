// 06_sd.ino
// SD card helpers: init, list directory, read file, write file
// Designed to be called from the project's `setup()` for testing (sdTest()).

#include <SD.h>
#include <SPI.h>
#include <time.h>

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
  // Keep any existing log files intact on boot. Rollover/truncation is handled
  // by the sensor task when it detects a month change (after NTP time is available).
  return true;
}

// Write a text file to SD. Returns true on success.
bool sdWriteText(const char* path, const String &content) {
  // Use FILE_APPEND to ensure we append to existing logs instead of truncating
  File file = SD.open(path, FILE_APPEND);
  if (!file) {
    Serial.printf("Failed to open %s for writing\n", path);
    return false;
  }
  // Append the content. Header row is written only when the file is created
  // or explicitly truncated (sdTruncateLogFile()). Writing the header here
  // caused repeated header lines in some SD implementations.
  file.println(content);
  // Ensure data is flushed to the card promptly to reduce partial-line cases
  // if a reboot/power-cycle occurs shortly after writing.
  #if defined(ARDUINO_ARCH_ESP32)
  file.flush();
  #endif
  file.close();
  Serial.printf("Wrote to %s\n", path);
  return true;
}

// Wipe all files under /log but keep the /log directory itself
void sdWipeLogs() {
  if (!SD.exists("/log")) return;
  File dir = SD.open("/log");
  if (!dir || !dir.isDirectory()) return;
  File file = dir.openNextFile();
  while (file) {
    String childName = String(file.name());
    String childPath = childName.startsWith("/") ? childName : String("/log/") + childName;
    // keep the main log file `log.txt` when doing a full wipe unless explicitly wanted
    if (childPath == String("/log/log.txt")) {
      file = dir.openNextFile();
      continue;
    }
    if (file.isDirectory()) {
      sdWipeDirContents(childPath.c_str());
      SD.rmdir(childPath.c_str());
    } else {
      SD.remove(childPath.c_str());
    }
    file = dir.openNextFile();
  }
  dir.close();
}

// Truncate or create /log/log.txt (used as single-month log file)
void sdTruncateLogFile() {
  if (!SD.exists("/log")) SD.mkdir("/log");
  // open for write (O_TRUNC) by using FILE_WRITE and then seek to 0+truncate
  File f = SD.open("/log/log.txt", FILE_WRITE);
  if (!f) {
    Serial.println("Failed to open /log/log.txt for truncation");
    return;
  }
  // Not all SD implementations support truncate(); remove and recreate instead
  f.close();
  SD.remove("/log/log.txt");
  File f2 = SD.open("/log/log.txt", FILE_WRITE);
  if (f2) {
    // write header row to newly-created log
    f2.println("timestamp,soilPercent,waterPercent,temp,hum,pumpOn,timeSynced");
    #if defined(ARDUINO_ARCH_ESP32)
    f2.flush();
    #endif
    f2.close();
  }
  Serial.println("Truncated /log/log.txt");
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

// (sdTest removed) Quick test function removed to prevent accidental writes.

// Brute-force upload handler for emergency drag&drop.
// Behavior:
// - The first incoming file (UPLOAD_FILE_START) will trigger wiping all contents
//   of `/app` (but keep the `/app` directory itself). This is intentional.
// - upload.filename should be the path relative to the SD root (e.g. "index.html"
//   or "_next/static/..." or "/index.html"). Leading slash is optional.
// - Files are streamed directly to SD to avoid holding them in RAM.
// - This intentionally avoids any handshake or complex protocol.
void sdHandleUpload(HTTPUpload &upload) {
  static File currentUploadFile;
  static String currentUploadPath = "";

  String filename = upload.filename;
  if (filename.length() == 0) return; // nothing to do
  // Normalize and ensure path is under /app
  if (!filename.startsWith("/")) filename = String("/") + filename;
  if (!filename.startsWith("/app/") && filename != "/app") {
    if (filename == "/") filename = String("/app/");
    else filename = String("/app") + filename;
  }

  if (upload.status == UPLOAD_FILE_START) {
    Serial.printf("Upload start: %s\n", filename.c_str());
    // close any previous lingering file
    if (currentUploadFile) {
      currentUploadFile.close();
      currentUploadFile = File();
      currentUploadPath = "";
    }
    // ensure directories exist for the incoming file
    int lastSlash = filename.lastIndexOf('/');
    if (lastSlash > 0) {
      String dir = filename.substring(0, lastSlash);
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
    // open (truncate) once and keep the File open across callbacks
    currentUploadFile = SD.open(filename.c_str(), FILE_WRITE);
    if (!currentUploadFile) {
      Serial.printf("Failed to open %s for writing\n", filename.c_str());
    } else {
      currentUploadPath = filename;
    }
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (!currentUploadFile) {
      // fallback: try to open for append
      currentUploadFile = SD.open(filename.c_str(), FILE_APPEND);
      if (currentUploadFile) currentUploadPath = filename;
    }
    if (currentUploadFile) {
      size_t written = currentUploadFile.write(upload.buf, upload.currentSize);
      if (written != upload.currentSize) {
        Serial.printf("Warning: wrote %u of %u bytes to %s\n", (unsigned)written, (unsigned)upload.currentSize, filename.c_str());
      }
      // Yield to the RTOS / WiFi stack to avoid watchdog
      delay(0);
    } else {
      Serial.printf("Failed to append to %s\n", filename.c_str());
    }
  } else if (upload.status == UPLOAD_FILE_END) {
    // close file if it matches
    if (currentUploadFile) {
      currentUploadFile.close();
      currentUploadFile = File();
      currentUploadPath = "";
    }
    Serial.printf("Upload complete: %s (%u bytes)\n", filename.c_str(), upload.totalSize);
  }
}
