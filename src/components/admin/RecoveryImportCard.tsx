"use client";

import { useState, useRef } from "react";
import { Upload, FileJson, CheckCircle, XCircle, AlertTriangle, Download, Copy, Check } from "lucide-react";

const EXTRACTION_SCRIPT_URL = "/api/admin/recovery/script";

interface ImportResults {
  total: number;
  conversationsCreated: number;
  messagesImported: number;
  messagesSkipped: number;
  errorCount: number;
  errors: Array<{ index: number; reason: string }>;
}

export function RecoveryImportCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const scriptUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/admin/recovery/script`
    : "";

  const handleFile = (f: File) => {
    if (!f.name.endsWith(".json")) {
      setError("Please select a JSON file exported by the 3CX recovery script.");
      return;
    }
    setFile(f);
    setError(null);
    setResults(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setResults(null);

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      const res = await fetch("/api/admin/recovery/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Import failed");
        return;
      }

      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
    } finally {
      setIsUploading(false);
    }
  };

  const copyInstructions = async () => {
    const instructions = `3CX Chat Recovery Instructions
================================

1. Open Chrome on your computer
2. Go to: https://chachatowing.fl.3cx.us and log in
3. Press F12 → click "Console" tab
4. Copy the script from: ${scriptUrl}
5. Paste it in the console and press Enter
6. A file named "3cx-recovery-....json" will download automatically
7. Upload that file at: ${window.location.href}

The script only reads your local browser cache.
It does NOT send anything to the internet automatically.`;
    await navigator.clipboard.writeText(instructions);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Instructions panel */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900">How to recover missing messages</h3>
            <p className="text-sm text-amber-800 mt-1">
              Messages from March 4–22 only exist on employee devices. Each person needs to run
              the extraction script on the browser they used for 3CX chat during that period.
            </p>
          </div>
        </div>

        <ol className="text-sm text-amber-900 space-y-2 ml-2">
          <li className="flex gap-2">
            <span className="font-bold text-amber-700 flex-shrink-0">1.</span>
            <span>
              Send employees the extraction script URL:{" "}
              <a
                href={EXTRACTION_SCRIPT_URL}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 text-amber-900 hover:bg-amber-200"
              >
                {scriptUrl}
              </a>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-amber-700 flex-shrink-0">2.</span>
            <span>They open Chrome, go to the 3CX site, press F12 → Console, paste and run the script.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-amber-700 flex-shrink-0">3.</span>
            <span>A JSON file downloads automatically. They send it to you.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-amber-700 flex-shrink-0">4.</span>
            <span>You upload each JSON file here to import the recovered messages.</span>
          </li>
        </ol>

        <div className="mt-4 flex gap-3">
          <a
            href={EXTRACTION_SCRIPT_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            View extraction script
          </a>
          <button
            onClick={copyInstructions}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-amber-800 text-sm font-medium rounded-lg border border-amber-300 hover:bg-amber-50 transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy instructions for employees"}
          </button>
        </div>
      </div>

      {/* Upload area */}
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Import Recovery File</h2>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-teal-400 bg-teal-50"
              : file
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200 hover:border-teal-300 hover:bg-slate-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileJson className="h-8 w-8 text-emerald-500" />
              <div className="text-left">
                <p className="font-semibold text-slate-800">{file.name}</p>
                <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-700">Drop JSON file here or click to browse</p>
              <p className="text-sm text-slate-500 mt-1">Files named 3cx-recovery-....json</p>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {file && !results && (
          <button
            onClick={handleImport}
            disabled={isUploading}
            className="mt-4 w-full py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import Messages
              </>
            )}
          </button>
        )}

        {results && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <h3 className="font-semibold text-emerald-900">Import Complete</h3>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-emerald-700">Records processed</dt>
                <dd className="font-bold text-emerald-900 text-lg">{results.total.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-emerald-700">Messages imported</dt>
                <dd className="font-bold text-emerald-900 text-lg">{results.messagesImported.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-slate-600">Conversations created</dt>
                <dd className="font-semibold text-slate-800">{results.conversationsCreated}</dd>
              </div>
              <div>
                <dt className="text-slate-600">Already existed (skipped)</dt>
                <dd className="font-semibold text-slate-800">{results.messagesSkipped}</dd>
              </div>
            </dl>
            {results.errorCount > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-800">
                  {results.errorCount} record(s) could not be imported:
                </p>
                <ul className="mt-1 text-xs text-amber-700 space-y-1">
                  {results.errors.map((e, i) => (
                    <li key={i}>Row {e.index}: {e.reason}</li>
                  ))}
                  {results.errorCount > results.errors.length && (
                    <li>...and {results.errorCount - results.errors.length} more</li>
                  )}
                </ul>
              </div>
            )}
            <button
              onClick={() => { setFile(null); setResults(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              className="mt-4 w-full py-2 bg-white text-slate-700 font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-sm"
            >
              Import another file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
