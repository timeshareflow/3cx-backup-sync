import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET_NAME = "backupwiz-files";

async function check() {
  // Count media files in database
  const { count: mediaCount } = await supabase
    .from("media_files")
    .select("*", { count: "exact", head: true });

  console.log(`=== DATABASE ===`);
  console.log(`Media files in database: ${mediaCount || 0}`);

  // Get messages with media
  const { count: mediaMessages } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("has_media", true);

  console.log(`Messages with has_media=true: ${mediaMessages || 0}`);

  // Get tenants
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("is_active", true);

  console.log(`\n=== STORAGE BUCKET: ${BUCKET_NAME} ===`);

  for (const tenant of tenants || []) {
    console.log(`\nTenant: ${tenant.name} (${tenant.id})`);

    // List storage files
    const categories = ["chat-media", "recordings", "voicemails"];
    for (const category of categories) {
      const basePath = `${tenant.id}/${category}`;
      const { data: files, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(basePath);

      if (error) {
        console.log(`  ${category}: Error - ${error.message}`);
      } else if (!files || files.length === 0) {
        console.log(`  ${category}: empty`);
      } else {
        // Check for year folders
        const years = files.filter((f) => !f.id);
        const directFiles = files.filter((f) => f.id);
        console.log(`  ${category}: ${years.length} year folders, ${directFiles.length} direct files`);

        // List files in year/month folders
        for (const year of years.slice(0, 2)) {
          const yearPath = `${basePath}/${year.name}`;
          const { data: months } = await supabase.storage
            .from(BUCKET_NAME)
            .list(yearPath);

          for (const month of months?.slice(0, 2) || []) {
            if (month.id) continue;
            const monthPath = `${yearPath}/${month.name}`;
            const { data: monthFiles } = await supabase.storage
              .from(BUCKET_NAME)
              .list(monthPath);

            const actualFiles = monthFiles?.filter((f) => f.id) || [];
            if (actualFiles.length > 0) {
              console.log(`    ${monthPath}: ${actualFiles.length} files`);
              actualFiles.slice(0, 3).forEach((f) => console.log(`      - ${f.name}`));
            }
          }
        }
      }
    }
  }
}

check().catch(console.error);
