import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface MediaFile {
  id: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_type: string;
  tenant_id: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = await createClient();

    // Get media file info (uses user session for RLS)
    const { data, error } = await supabase
      .from("media_files")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      console.error("Media not found:", id, error?.message);
      return NextResponse.json(
        { error: "Media not found" },
        { status: 404 }
      );
    }

    const media = data as unknown as MediaFile;

    // Use admin client for storage access (bypasses storage RLS)
    const adminClient = createAdminClient();

    // Generate signed URL from Supabase Storage (valid for 1 hour)
    const { data: signedUrlData, error: urlError } = await adminClient
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

    return NextResponse.json({
      url: signedUrlData.signedUrl,
      filename: media.file_name,
      mime_type: media.mime_type,
      file_type: media.file_type,
    });
  } catch (error) {
    console.error("Error in media API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
