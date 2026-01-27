import { NextResponse } from "next/server";

// Current version of the sync agent
// Update this when releasing new versions
const CURRENT_VERSION = "1.0.0";

// Changelog for the version
const CHANGELOG = {
  "1.0.0": "Initial release with auto-detection and auto-updates",
};

export async function GET() {
  return NextResponse.json({
    version: CURRENT_VERSION,
    changelog: CHANGELOG[CURRENT_VERSION as keyof typeof CHANGELOG] || "",
    download_url: "https://github.com/timeshareflow/3cx-backup-sync/archive/refs/heads/main.zip",
    install_script: "https://3cxbackupwiz.com/install.sh",
  });
}
