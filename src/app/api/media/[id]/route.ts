import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface MediaFile {
  id: string;
  storage_path: string;
  original_filename: string | null;
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

    // Get media file info
    const { data, error } = await supabase
      .from("media_files")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Media not found" },
        { status: 404 }
      );
    }

    const media = data as unknown as MediaFile;

    // Generate signed URL from Supabase Storage (valid for 1 hour)
    const { data: signedUrlData, error: urlError } = await supabase
      .storage
      .from("media")
      .createSignedUrl(media.storage_path, 3600);

    if (urlError || !signedUrlData?.signedUrl) {
      return NextResponse.json(
        { error: "Failed to generate URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      url: signedUrlData.signedUrl,
      filename: media.original_filename,
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
