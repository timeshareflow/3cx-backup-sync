/**
 * 3CX Chat Recovery Script — Chrome/PWA Browser Extraction
 *
 * PURPOSE: Extract locally cached 3CX chat messages from this browser's IndexedDB
 *          that are missing from the BackupWiz server (March 4 – March 22, 2026).
 *
 * HOW TO USE:
 *   1. Open Chrome and navigate to your 3CX web app (e.g. https://chachatowing.fl.3cx.us)
 *   2. Log in if needed — you must be ON the 3CX site for this to work
 *   3. Press F12 to open DevTools → click the "Console" tab
 *   4. Paste this entire script and press Enter
 *   5. Wait for it to finish — it will print progress to the console
 *   6. A JSON file will download automatically with all found messages
 *   7. Send that file to your IT administrator (do NOT email — use the secure upload link provided)
 *
 * WHAT IT DOES: Reads locally stored chat data from your browser's cache.
 *               It does NOT access the internet, send passwords, or modify anything.
 *               It only reads chat messages and conversation history.
 */

(async function threeCXRecovery() {
  const RECOVERY_START = new Date("2026-03-04T00:00:00Z").getTime();
  const RECOVERY_END   = new Date("2026-03-23T00:00:00Z").getTime();
  const SCRIPT_VERSION = "1.0.0";

  console.log("==========================================================");
  console.log("  3CX Chat Recovery Script v" + SCRIPT_VERSION);
  console.log("  Extracting messages from: March 4 – March 22, 2026");
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
    // Must have some content and some date
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
    // Fall back to searching all keys
    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined) continue;
      const t = typeof value === "number"
        ? (value > 1e10 ? value : value * 1000)
        : (typeof value === "string" ? new Date(value).getTime() : NaN);
      if (!isNaN(t) && t > 1577836800000 && t < 2000000000000) { // 2020–2033 sanity check
        return { key, value, ts: t };
      }
    }
    return null;
  }

  function openDB(name, version) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("DB blocked: " + name));
    });
  }

  function getAllFromStore(db, storeName) {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } catch (e) {
        resolve([]); // store may not support getAll or may be locked
      }
    });
  }

  function cursorScan(db, storeName) {
    return new Promise((resolve) => {
      const results = [];
      try {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => resolve(results);
      } catch {
        resolve(results);
      }
    });
  }

  // ─── Phase 1: Enumerate all databases ────────────────────────────────────

  let databases = [];
  try {
    databases = await indexedDB.databases();
    console.log("\n[1/4] Found " + databases.length + " IndexedDB database(s) on this origin:");
    databases.forEach(db => console.log("      → " + db.name + " (v" + db.version + ")"));
  } catch (e) {
    console.warn("[!] indexedDB.databases() not available — will try known 3CX DB names");
    // Fallback: try common 3CX IndexedDB names
    databases = [
      { name: "3CX_Chat", version: undefined },
      { name: "3cx", version: undefined },
      { name: "threecx", version: undefined },
      { name: "chat", version: undefined },
      { name: "messages", version: undefined },
      { name: "webclient", version: undefined },
      { name: "3CX", version: undefined },
      { name: "ChatDB", version: undefined },
      { name: "ConversationDB", version: undefined },
    ].map(d => ({ ...d }));
  }

  if (databases.length === 0) {
    console.error("[!] No IndexedDB databases found on this origin.");
    console.error("    Make sure you are ON the 3CX web app page (not a different tab).");
    return;
  }

  // ─── Phase 2: Scan each database ─────────────────────────────────────────

  const allResults = {
    extractedAt: new Date().toISOString(),
    scriptVersion: SCRIPT_VERSION,
    origin: window.location.origin,
    userAgent: navigator.userAgent,
    recoveryRange: {
      from: "2026-03-04T00:00:00Z",
      to:   "2026-03-23T00:00:00Z"
    },
    databases: [],
    recoveredMessages: [],
    otherData: {},
  };

  console.log("\n[2/4] Scanning databases for messages...");

  for (const dbInfo of databases) {
    if (!dbInfo.name) continue;

    let db;
    try {
      db = await openDB(dbInfo.name, dbInfo.version);
    } catch (e) {
      console.warn("      [skip] " + dbInfo.name + " — could not open: " + e.message);
      continue;
    }

    const storeNames = Array.from(db.objectStoreNames);
    console.log("\n  DB: \"" + dbInfo.name + "\" — " + storeNames.length + " store(s): [" + storeNames.join(", ") + "]");

    const dbEntry = {
      name: dbInfo.name,
      version: db.version,
      stores: {},
      messagesFound: 0,
    };

    for (const storeName of storeNames) {
      let records;
      try {
        records = await getAllFromStore(db, storeName);
        if (!records || records.length === 0) {
          records = await cursorScan(db, storeName);
        }
      } catch {
        records = await cursorScan(db, storeName);
      }

      console.log("      store \"" + storeName + "\": " + records.length + " records");

      // Categorize and filter records
      const messageRecords = [];
      const otherRecords = [];

      for (const record of records) {
        const tsInfo = extractTimestamp(record);
        if (tsInfo && isInRange(tsInfo.ts) && looksLikeMessage(record)) {
          messageRecords.push({
            _db: dbInfo.name,
            _store: storeName,
            _recoveredAt: new Date().toISOString(),
            ...record,
          });
        } else if (looksLikeMessage(record) && tsInfo) {
          // Message-like but outside range — keep for context (conversations, participants)
          otherRecords.push(record);
        }
      }

      if (messageRecords.length > 0) {
        console.log("        ✓ " + messageRecords.length + " message(s) in recovery range!");
        allResults.recoveredMessages.push(...messageRecords);
        dbEntry.messagesFound += messageRecords.length;
      }

      // Always capture conversation/participant store data as context
      const storeNameLower = storeName.toLowerCase();
      const isContextStore = (
        storeNameLower.includes("conversation") ||
        storeNameLower.includes("contact") ||
        storeNameLower.includes("participant") ||
        storeNameLower.includes("user") ||
        storeNameLower.includes("extension") ||
        storeNameLower.includes("party")
      );

      dbEntry.stores[storeName] = {
        totalRecords: records.length,
        messagesInRange: messageRecords.length,
      };

      if (isContextStore && records.length > 0 && records.length < 5000) {
        allResults.otherData[dbInfo.name + "." + storeName] = records;
        console.log("        (saved " + records.length + " context records from \"" + storeName + "\")");
      }
    }

    allResults.databases.push(dbEntry);
    db.close();
  }

  // ─── Phase 3: Summary ────────────────────────────────────────────────────

  console.log("\n[3/4] Extraction complete.");
  console.log("      Databases scanned:  " + allResults.databases.length);
  console.log("      Messages recovered: " + allResults.recoveredMessages.length);

  if (allResults.recoveredMessages.length === 0) {
    console.warn("\n[!] No messages found in the March 4–22 range.");
    console.warn("    This can happen if:");
    console.warn("    - This browser was not used for 3CX chat during that period");
    console.warn("    - The browser cache was cleared");
    console.warn("    - 3CX stores data differently on this device");
    console.warn("\n    Still downloading the scan report — it may help diagnose the schema.");
  }

  // ─── Phase 4: Download ───────────────────────────────────────────────────

  console.log("\n[4/4] Preparing download...");

  const json = JSON.stringify(allResults, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const filename = "3cx-recovery-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";

  a.href     = url;
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 10000);

  console.log("\n==========================================================");
  console.log("  DOWNLOAD STARTED: " + filename);
  console.log("  File size: ~" + (json.length / 1024).toFixed(1) + " KB");
  console.log("==========================================================");
  console.log("  Send this file to your IT administrator.");
  console.log("  Do NOT email it — use the secure upload link provided.");
  console.log("==========================================================\n");

  return {
    messagesFound: allResults.recoveredMessages.length,
    filename,
  };
})();
