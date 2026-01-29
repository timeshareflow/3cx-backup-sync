import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data } = await supabase
    .from("media_files")
    .select("file_name, mime_type, file_size")
    .order("file_size", { ascending: false });

  let totalSize = 0;
  let videoSize = 0;
  let imageSize = 0;
  let audioSize = 0;
  let otherSize = 0;
  let videoCount = 0;
  let imageCount = 0;

  for (const f of data || []) {
    const size = f.file_size || 0;
    totalSize += size;
    if (f.mime_type?.startsWith("video/")) {
      videoSize += size;
      videoCount++;
    } else if (f.mime_type?.startsWith("image/")) {
      imageSize += size;
      imageCount++;
    } else if (f.mime_type?.startsWith("audio/")) {
      audioSize += size;
    } else {
      otherSize += size;
    }
  }

  const mb = (b: number) => (b / 1024 / 1024).toFixed(1) + " MB";
  console.log("=== STORAGE BREAKDOWN (media_files table) ===");
  console.log("Total:", mb(totalSize), "(" + (data || []).length + " files)");
  console.log("Videos:", mb(videoSize), "(" + videoCount + " files)");
  console.log("Images:", mb(imageSize), "(" + imageCount + " files)");
  console.log("Audio:", mb(audioSize));
  console.log("Other:", mb(otherSize));

  console.log("\n=== TOP 10 LARGEST FILES ===");
  for (const f of (data || []).slice(0, 10)) {
    console.log(
      " ",
      mb(f.file_size || 0),
      "-",
      f.file_name?.substring(0, 50),
      "(" + f.mime_type + ")"
    );
  }

  // Also check recordings and voicemails
  const { data: recs } = await supabase
    .from("call_recordings")
    .select("file_size");
  const { data: vms } = await supabase.from("voicemails").select("file_size");
  const recSize = (recs || []).reduce(
    (s: number, r: { file_size: number | null }) => s + (r.file_size || 0),
    0
  );
  const vmSize = (vms || []).reduce(
    (s: number, v: { file_size: number | null }) => s + (v.file_size || 0),
    0
  );
  console.log("\n=== OTHER STORAGE ===");
  console.log(
    "Call recordings:",
    mb(recSize),
    "(" + (recs || []).length + " files)"
  );
  console.log(
    "Voicemails:",
    mb(vmSize),
    "(" + (vms || []).length + " files)"
  );
  console.log("\nGRAND TOTAL:", mb(totalSize + recSize + vmSize));
}
main().then(() => process.exit(0));
