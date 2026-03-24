/**
 * 3CX Chat Recovery Script — Chrome/PWA Browser Extraction
 *
 * PURPOSE: Extract locally cached 3CX chat messages AND media files from this
 *          browser's local storage that are missing from the BackupWiz server
 *          (March 4 – March 22, 2026).
 *
 * HOW TO USE:
 *   1. Open Chrome and navigate to your 3CX web app (e.g. https://chachatowing.fl.3cx.us)
 *   2. Log in if needed — you must be ON the 3CX site for this to work
 *   3. Press F12 to open DevTools → click the "Console" tab
 *   4. Paste this entire script and press Enter
 *   5. Wait for it to finish — it will print progress to the console
 *   6. A JSON file will download automatically with all found messages and media
 *   7. Send that file to your IT administrator (do NOT email — use the secure upload link provided)
 *
 * WHAT IT DOES: Reads locally stored chat data and cached media from your browser.
 *               It does NOT access the internet, send passwords, or modify anything.
 *               It only reads chat messages, conversation history, and cached images/files.
 *
 * NOTE ON FILE SIZE: If many media files are cached, the download may be 10-100 MB.
 *                    This is normal. Individual files > 20 MB are skipped to keep
 *                    the export manageable.
 */

(async function threeCXRecovery() {
  const RECOVERY_START   = new Date("2026-03-04T00:00:00Z").getTime();
  const RECOVERY_END     = new Date("2026-03-23T00:00:00Z").getTime();
  const MAX_MEDIA_BYTES  = 20 * 1024 * 1024; // skip individual files > 20 MB
  const SCRIPT_VERSION   = "1.1.0";

  console.log("==========================================================");
  console.log("  3CX Chat Recovery Script v" + SCRIPT_VERSION);
  console.log("  Extracting messages + media from: March 4 – March 22, 2026");
  console.log("==========================================================");

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function isInRange(value) {
    if (!value) return false;
    const t = new Date(value).getTime();
    return !isNaN(t) && t >= RECOVERY_START && t <= RECOVERY_END;
  }

  function looksLikeMessage(record) {
    if (!record || typeof record !== "object") return false;
    const keys = Object.keys(record).map(k => k.toLowerCase());
    const hasContent = keys.some(k =>
      k.includes("message") || k.includes("text") || k.includes("body") ||
      k.includes("content") || k.includes("msg")
    );
    const hasDate = keys.some(k =>
      k.includes("time") || k.includes("date") || k.includes("stamp") ||
      k.includes("sent") || k.includes("created") || k.includes("at")
    );
    return hasContent && hasDate;
  }

  function extractTimestamp(record) {
    const candidates = [
      "timeSent", "time_sent", "timestamp", "date", "createdAt", "created_at",
      "sentAt", "sent_at", "time", "dt", "dateTime", "dateCreated"
    ];
    for (const key of candidates) {
      if (record[key] !== undefined && record[key] !== null) {
        const v = record[key];
        const t = typeof v === "number" ? (v > 1e10 ? v : v * 1000) : new Date(v).getTime();
        if (!isNaN(t) && t > 1e12) return { key, value: v, ts: t };
      }
    }
    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined) continue;
      const t = typeof value === "number"
        ? (value > 1e10 ? value : value * 1000)
        : (typeof value === "string" ? new Date(value).getTime() : NaN);
      if (!isNaN(t) && t > 1577836800000 && t < 2000000000000) {
        return { key, value, ts: t };
      }
    }
    return null;
  }

  function openDB(name, version) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
      req.onblocked = () => reject(new Error("DB blocked: " + name));
    });
  }

  function getAllFromStore(db, storeName) {
    return new Promise((resolve) => {
      try {
        const tx    = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req   = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror   = () => resolve([]);
      } catch { resolve([]); }
    });
  }

  function cursorScan(db, storeName) {
    return new Promise((resolve) => {
      const results = [];
      try {
        const tx    = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req   = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) { results.push(cursor.value); cursor.continue(); }
          else resolve(results);
        };
        req.onerror = () => resolve(results);
      } catch { resolve(results); }
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function isMediaContentType(ct) {
    if (!ct) return false;
    return (
      ct.startsWith("image/") ||
      ct.startsWith("video/") ||
      ct.startsWith("audio/") ||
      ct === "application/pdf" ||
      ct.includes("word") ||
      ct.includes("excel") ||
      ct.includes("spreadsheet") ||
      ct.includes("presentation") ||
      ct.includes("octet-stream")
    );
  }

  function isMediaUrl(url) {
    const lower = url.toLowerCase();
    return (
      lower.includes("/files/") ||
      lower.includes("/media/") ||
      lower.includes("/upload") ||
      lower.includes("/attachment") ||
      lower.includes("/chat/") ||
      /\.(jpe?g|png|gif|webp|mp4|mov|webm|pdf|docx?|xlsx?|zip|heic)(\?|$)/.test(lower)
    );
  }

  function filenameFromUrl(url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/");
      return parts[parts.length - 1] || u.hostname + "_cached";
    } catch {
      return "file_" + Math.random().toString(36).slice(2);
    }
  }

  // ─── Phase 1: Enumerate IndexedDB databases ───────────────────────────────

  let databases = [];
  try {
    databases = await indexedDB.databases();
    console.log("\n[1/5] Found " + databases.length + " IndexedDB database(s):");
    databases.forEach(db => console.log("      → " + db.name + " (v" + db.version + ")"));
  } catch {
    console.warn("[!] indexedDB.databases() not available — trying known 3CX DB names");
    databases = [
      "3CX_Chat", "3cx", "threecx", "chat", "messages", "webclient", "3CX", "ChatDB", "ConversationDB"
    ].map(name => ({ name, version: undefined }));
  }

  const allResults = {
    extractedAt:    new Date().toISOString(),
    scriptVersion:  SCRIPT_VERSION,
    origin:         window.location.origin,
    userAgent:      navigator.userAgent,
    recoveryRange:  { from: "2026-03-04T00:00:00Z", to: "2026-03-23T00:00:00Z" },
    databases:      [],
    recoveredMessages: [],
    recoveredMedia:    [],   // { url, filename, contentType, sizeBytes, base64, cacheName, skipped? }
    otherData:      {},
  };

  // ─── Phase 2: Scan IndexedDB for messages ────────────────────────────────

  console.log("\n[2/5] Scanning IndexedDB for messages...");

  for (const dbInfo of databases) {
    if (!dbInfo.name) continue;

    let db;
    try { db = await openDB(dbInfo.name, dbInfo.version); }
    catch (e) { console.warn("      [skip] " + dbInfo.name + " — " + e.message); continue; }

    const storeNames = Array.from(db.objectStoreNames);
    console.log("\n  DB: \"" + dbInfo.name + "\" — stores: [" + storeNames.join(", ") + "]");

    const dbEntry = { name: dbInfo.name, version: db.version, stores: {}, messagesFound: 0 };

    for (const storeName of storeNames) {
      let records = await getAllFromStore(db, storeName);
      if (!records.length) records = await cursorScan(db, storeName);

      console.log("      store \"" + storeName + "\": " + records.length + " records");

      const messageRecords = [];
      for (const record of records) {
        const tsInfo = extractTimestamp(record);
        if (tsInfo && isInRange(tsInfo.ts) && looksLikeMessage(record)) {
          messageRecords.push({ _db: dbInfo.name, _store: storeName, _recoveredAt: new Date().toISOString(), ...record });
        }
      }

      if (messageRecords.length > 0) {
        console.log("        ✓ " + messageRecords.length + " message(s) in recovery range!");
        allResults.recoveredMessages.push(...messageRecords);
        dbEntry.messagesFound += messageRecords.length;
      }

      const storeNameLower = storeName.toLowerCase();
      const isContextStore = (
        storeNameLower.includes("conversation") || storeNameLower.includes("contact") ||
        storeNameLower.includes("participant") || storeNameLower.includes("user") ||
        storeNameLower.includes("extension")
      );
      dbEntry.stores[storeName] = { totalRecords: records.length, messagesInRange: messageRecords.length };
      if (isContextStore && records.length > 0 && records.length < 5000) {
        allResults.otherData[dbInfo.name + "." + storeName] = records;
      }
    }

    allResults.databases.push(dbEntry);
    db.close();
  }

  console.log("\n      Messages found: " + allResults.recoveredMessages.length);

  // ─── Phase 3: Scan Cache Storage for media files ─────────────────────────

  console.log("\n[3/5] Scanning Cache Storage for media files...");

  if (!("caches" in window)) {
    console.warn("      [!] Cache Storage API not available in this browser context.");
    console.warn("          Try opening DevTools BEFORE loading the page, or use Chrome.");
  } else {
    let cacheNames = [];
    try { cacheNames = await caches.keys(); }
    catch (e) { console.warn("      [!] Could not list caches: " + e.message); }

    console.log("      Found " + cacheNames.length + " cache(s): [" + cacheNames.join(", ") + "]");

    let mediaSeen = 0;
    let mediaSkippedSize = 0;
    let mediaSkippedType = 0;

    for (const cacheName of cacheNames) {
      let cache;
      try { cache = await caches.open(cacheName); }
      catch { continue; }

      let requests = [];
      try { requests = await cache.keys(); }
      catch { continue; }

      for (const request of requests) {
        const url = request.url;

        let response;
        try { response = await cache.match(request); }
        catch { continue; }
        if (!response) continue;

        const contentType = response.headers.get("content-type") || "";
        const isMedia = isMediaContentType(contentType) || isMediaUrl(url);
        if (!isMedia) { mediaSkippedType++; continue; }

        // Clone before consuming body
        const responseClone = response.clone();
        let blob;
        try { blob = await responseClone.blob(); }
        catch { continue; }

        mediaSeen++;
        const filename = filenameFromUrl(url);

        if (blob.size > MAX_MEDIA_BYTES) {
          console.log("      [skip - too large] " + filename + " (" + (blob.size / 1024 / 1024).toFixed(1) + " MB)");
          allResults.recoveredMedia.push({
            url, filename, cacheName,
            contentType: blob.type || contentType,
            sizeBytes: blob.size,
            skipped: true,
            reason: "File exceeds 20 MB limit",
          });
          mediaSkippedSize++;
          continue;
        }

        let base64 = null;
        try {
          base64 = await blobToBase64(blob);
        } catch (e) {
          console.warn("      [skip - read error] " + filename + ": " + e.message);
          continue;
        }

        console.log("      ✓ " + filename + " (" + (blob.size / 1024).toFixed(1) + " KB, " + (blob.type || contentType) + ")");
        allResults.recoveredMedia.push({
          url, filename, cacheName,
          contentType: blob.type || contentType,
          sizeBytes: blob.size,
          base64,
        });
      }
    }

    console.log(
      "\n      Media files captured: " + allResults.recoveredMedia.filter(m => !m.skipped).length +
      " | Skipped (too large): " + mediaSkippedSize +
      " | Skipped (not media): " + mediaSkippedType
    );
  }

  // ─── Phase 4: Summary ────────────────────────────────────────────────────

  console.log("\n[4/5] Extraction complete.");
  console.log("      Messages recovered: " + allResults.recoveredMessages.length);
  console.log("      Media files recovered: " + allResults.recoveredMedia.filter(m => !m.skipped).length);

  if (allResults.recoveredMessages.length === 0 && allResults.recoveredMedia.filter(m => !m.skipped).length === 0) {
    console.warn("\n[!] Nothing found. This browser may not have been used for 3CX during March 4–22,");
    console.warn("    or its cache was cleared. Still downloading the scan report for diagnostics.");
  }

  // ─── Phase 5: Download ───────────────────────────────────────────────────

  console.log("\n[5/5] Preparing download...");

  const json = JSON.stringify(allResults, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const filename = "3cx-recovery-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";

  a.href     = url;
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 10000);

  const sizeMB = (json.length / 1024 / 1024).toFixed(1);
  console.log("\n==========================================================");
  console.log("  DOWNLOAD STARTED: " + filename);
  console.log("  File size: ~" + sizeMB + " MB");
  console.log("==========================================================");
  console.log("  Send this file to your IT administrator.");
  console.log("  Do NOT email it — use the secure upload link provided.");
  console.log("==========================================================\n");

  return {
    messagesFound:    allResults.recoveredMessages.length,
    mediaFound:       allResults.recoveredMedia.filter(m => !m.skipped).length,
    filename,
    sizeMB,
  };
})();
