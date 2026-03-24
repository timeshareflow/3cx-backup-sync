import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const scriptPath = path.join(process.cwd(), "recovery", "3cx-ipad-extract.py");
    const content = await readFile(scriptPath, "utf-8");

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/x-python; charset=utf-8",
        "Content-Disposition": 'attachment; filename="3cx-ipad-extract.py"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }
}
