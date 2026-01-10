import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPresignedUrl } from "@/lib/s3/utils";

interface MediaFile {
  id: string;
  s3_key: string;
  original_filename: string | null;
  mime_type: string | null;
  file_type: string;
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

    // Generate presigned URL (valid for 1 hour)
    const url = await getPresignedUrl(media.s3_key, 3600);

    return NextResponse.json({
      url,
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
