import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be less than 5MB" }, { status: 400 });
    }

    // Generate unique filename
    const fileExt = file.name.split(".").pop() || "jpg";
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("user-avatars")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);

      // If bucket doesn't exist, try creating it
      if (uploadError.message.includes("Bucket not found")) {
        // Try to create the bucket
        const { error: bucketError } = await supabase.storage.createBucket("user-avatars", {
          public: true,
          fileSizeLimit: 5 * 1024 * 1024,
        });

        if (bucketError && !bucketError.message.includes("already exists")) {
          return NextResponse.json({ error: "Failed to create storage bucket" }, { status: 500 });
        }

        // Retry upload
        const { data: retryData, error: retryError } = await supabase.storage
          .from("user-avatars")
          .upload(filePath, buffer, {
            contentType: file.type,
            upsert: true,
          });

        if (retryError) {
          return NextResponse.json({ error: "Failed to upload avatar" }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: "Failed to upload avatar" }, { status: 500 });
      }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("user-avatars")
      .getPublicUrl(filePath);

    const avatarUrl = urlData.publicUrl;

    // Update user profile with new avatar URL
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (updateError) {
      console.error("Profile update error:", updateError);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ avatar_url: avatarUrl });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current avatar URL
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .single();

    // If there's an existing avatar, try to delete it from storage
    if (profile?.avatar_url) {
      try {
        const urlPath = new URL(profile.avatar_url).pathname;
        const storagePath = urlPath.split("/user-avatars/")[1];
        if (storagePath) {
          await supabase.storage.from("user-avatars").remove([storagePath]);
        }
      } catch (e) {
        // Ignore deletion errors
      }
    }

    // Update profile to remove avatar URL
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Avatar delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
