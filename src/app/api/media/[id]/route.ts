import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { getSignedUrl as getSpacesSignedUrl, isSpacesConfigured } from "@/lib/storage/spaces";

interface MediaFile {
  id: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_type: string;
  tenant_id: string;
  storage_backend?: string; // 'supabase' or 'spaces'
}

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

    // Build query - use admin client since RLS blocks super admins without tenant membership
    let query = supabase
      .from("media_files")
      .select("*")
      .eq("id", id);

    // Non-super-admin users: restrict to their tenant
    if (context.role !== "super_admin" && context.tenantId) {
      query = query.eq("tenant_id", context.tenantId);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      console.error("Media not found:", id, error?.message);
      return NextResponse.json(
        { error: "Media not found" },
        { status: 404 }
      );
    }

    const media = data as unknown as MediaFile;

    let signedUrl: string;

    // Check storage backend and generate appropriate signed URL
    if (media.storage_backend === "spaces" && isSpacesConfigured()) {
      // Generate signed URL from DO Spaces
      try {
        signedUrl = await getSpacesSignedUrl(media.storage_path, 3600);
      } catch (spacesError) {
        console.error("Failed to generate DO Spaces signed URL:", media.storage_path, spacesError);
        return NextResponse.json(
          { error: "Failed to generate URL" },
          { status: 500 }
        );
      }
    } else {
      // Generate signed URL from Supabase Storage (default/fallback)
      const { data: signedUrlData, error: urlError } = await supabase
        .storage
        .from("backupwiz-files")
        .createSignedUrl(media.storage_path, 3600);

      if (urlError || !signedUrlData?.signedUrl) {
        console.error("Failed to generate signed URL:", media.storage_path, urlError?.message);
        return NextResponse.json(
          { error: "Failed to generate URL" },
          { status: 500 }
        );
      }
      signedUrl = signedUrlData.signedUrl;
    }

    return NextResponse.json({
      url: signedUrl,
      filename: media.file_name,
      mime_type: media.mime_type,
      file_type: media.file_type,
      storage_backend: media.storage_backend || "supabase",
    });
  } catch (error) {
    console.error("Error in media API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
