import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Query just a few core columns to see what exists
  const { data, error } = await supabase
    .from("media_files")
    .select("id, file_name, storage_path, tenant_id, message_id, mime_type")
    .limit(5);

  if (error) {
    console.log("Error with full query:", error.message);

    // Try minimal
    const { data: data2, error: error2 } = await supabase
      .from("media_files")
      .select("*")
      .limit(1);

    if (error2) {
      console.log("Error with star:", error2.message);
    } else {
      console.log("Columns:", Object.keys(data2?.[0] || {}));
      console.log("Data:", JSON.stringify(data2?.[0], null, 2));
    }
  } else {
    console.log("Found", data?.length, "records");
    data?.forEach((row) => {
      console.log(JSON.stringify(row, null, 2));
    });
  }
}

check().catch(console.error);
