import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

// Serve the browser extraction script as a downloadable JS file.
// No auth required — the script itself has no credentials or sensitive data.
export async function GET() {
  try {
    const scriptPath = path.join(process.cwd(), "recovery", "3cx-browser-extract.js");
    const content = await readFile(scriptPath, "utf-8");

    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Content-Disposition": 'inline; filename="3cx-browser-extract.js"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }
}
