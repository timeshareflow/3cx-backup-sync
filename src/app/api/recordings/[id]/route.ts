import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { getSignedUrl as getSpacesSignedUrl, isSpacesConfigured } from "@/lib/storage/spaces";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Fetch the recording
    let query = supabase
      .from("call_recordings")
      .select("*")
      .eq("id", id);

    // Non-super-admin users must be scoped to their tenant. If a non-super-admin
    // has no tenant, deny — never fall through to an unscoped query, which would
    // return any tenant's recording by id (IDOR).
    if (context.role !== "super_admin") {
      if (!context.tenantId) {
        return NextResponse.json({ error: "No tenant access" }, { status: 403 });
      }
      query = query.eq("tenant_id", context.tenantId);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    let signedUrl: string;

    if (data.storage_backend === "supabase") {
      const { data: signedUrlData, error: urlError } = await supabase
        .storage
        .from("backupwiz-files")
        .createSignedUrl(data.storage_path, 3600);

      if (urlError || !signedUrlData?.signedUrl) {
        console.error("Failed to generate Supabase signed URL for recording:", data.storage_path, urlError?.message);
        return NextResponse.json({ error: "Failed to generate URL" }, { status: 500 });
      }
      signedUrl = signedUrlData.signedUrl;
    } else {
      try {
        signedUrl = await getSpacesSignedUrl(data.storage_path, 3600);
      } catch (spacesError) {
        console.error("Failed to generate DO Spaces signed URL for recording:", data.storage_path, spacesError);
        return NextResponse.json({ error: "Failed to generate URL" }, { status: 500 });
      }
    }

    return NextResponse.json({
      url: signedUrl,
      filename: data.file_name,
      mime_type: data.mime_type || "audio/wav",
    });
  } catch (error) {
    console.error("Error in recording playback API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
