import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { getSignedUrl as getSpacesSignedUrl, isSpacesConfigured } from "@/lib/storage/spaces";

export const dynamic = "force-dynamic";

interface MediaFile {
  id: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_type: string;
  tenant_id: string;
  storage_backend?: string; // 'supabase' or 'spaces'
  thumbnail_path?: string | null; // poster frame (webp) for videos, in Spaces
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ?thumb=1 → return a signed URL for the lightweight poster instead of the
  // full-size original (used by the gallery grid so it never downloads whole videos).
  const wantThumb = request.nextUrl.searchParams.get("thumb") === "1";

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

    // Non-super-admin users must be scoped to their tenant. If a non-super-admin
    // has no tenant, deny — never fall through to an unscoped query, which would
    // return any tenant's media by id (IDOR).
    if (context.role !== "super_admin") {
      if (!context.tenantId) {
        return NextResponse.json({ error: "No tenant access" }, { status: 403 });
      }
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

    // Poster request: sign the thumbnail if one exists (posters always live in
    // Spaces). If none yet, report null so the client shows an icon instead of
    // fetching the full-size original.
    if (wantThumb) {
      if (!media.thumbnail_path) {
        return NextResponse.json({ url: null, is_thumbnail: false });
      }
      try {
        const thumbUrl = await getSpacesSignedUrl(media.thumbnail_path, 3600);
        return NextResponse.json({ url: thumbUrl, is_thumbnail: true });
      } catch (thumbError) {
        console.error("Failed to sign thumbnail URL:", media.thumbnail_path, thumbError);
        return NextResponse.json({ url: null, is_thumbnail: false });
      }
    }

    let signedUrl: string;

    if (media.storage_backend === "supabase") {
      const { data: signedUrlData, error: urlError } = await supabase
        .storage
        .from("backupwiz-files")
        .createSignedUrl(media.storage_path, 3600);

      if (urlError || !signedUrlData?.signedUrl) {
        console.error("Failed to generate Supabase signed URL:", media.storage_path, urlError?.message);
        return NextResponse.json({ error: "Failed to generate URL" }, { status: 500 });
      }
      signedUrl = signedUrlData.signedUrl;
    } else {
      try {
        signedUrl = await getSpacesSignedUrl(media.storage_path, 3600);
      } catch (spacesError) {
        console.error("Failed to generate DO Spaces signed URL:", media.storage_path, spacesError);
        return NextResponse.json({ error: "Failed to generate URL" }, { status: 500 });
      }
    }

    return NextResponse.json({
      url: signedUrl,
      filename: media.file_name,
      mime_type: media.mime_type,
      file_type: media.file_type,
      storage_backend: media.storage_backend || "spaces",
    });
  } catch (error) {
    console.error("Error in media API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
