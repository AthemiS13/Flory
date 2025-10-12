// 06_sd.ino
// SD card helpers: init, list directory, read file, write file
// Designed to be called from the project's `setup()` for testing (sdTest()).

#include <SD.h>
#include <SPI.h>

// Chip select pin for SD card (D4 on many ESP32 boards)
const int SD_CS_PIN = 4;

// Initialize the SD card. Returns true on success.
bool sdInit() {
  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("SD init failed!");
    return false;
  }
  Serial.println("SD initialized.");
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

// Quick test function: init SD, write and read /test.txt and list root
void sdTest() {
  if (!sdInit()) return;
  sdWriteText("/test.txt", String("Hello from ESP32!"));
  sdReadText("/test.txt");
  sdListDir("/");
}

// Handle HTTP multipart upload chunks and write to SD
// Expects upload.filename to contain desired path (e.g., "out/index.html" or "index.html")
void sdHandleUpload(HTTPUpload &upload) {
  String filename = upload.filename;
  if (!filename.startsWith("/")) filename = String("/") + filename;

  if (upload.status == UPLOAD_FILE_START) {
    Serial.printf("Upload start: %s\n", filename.c_str());
    // create directories if needed
    int lastSlash = filename.lastIndexOf('/');
    if (lastSlash > 0) {
      String dir = filename.substring(0, lastSlash);
      // simple recursive mkdir: iterate components
      String accum = "";
      int start = 1; // skip leading /
      while (start < dir.length()) {
        int nextSlash = dir.indexOf('/', start);
        if (nextSlash == -1) nextSlash = dir.length();
        accum += "/" + dir.substring(start, nextSlash);
        File d = SD.open(accum.c_str());
        if (!d) {
          // try to create directory
          SD.mkdir(accum.c_str());
        } else d.close();
        start = nextSlash + 1;
      }
    }
    // open (truncate) file
    File f = SD.open(filename.c_str(), FILE_WRITE);
    if (f) f.close();
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    File f = SD.open(filename.c_str(), FILE_APPEND);
    if (f) {
      f.write(upload.buf, upload.currentSize);
      f.close();
    } else {
      Serial.printf("Failed to append to %s\n", filename.c_str());
    }
  } else if (upload.status == UPLOAD_FILE_END) {
    Serial.printf("Upload complete: %s (%u bytes)\n", filename.c_str(), upload.totalSize);
  }
}
