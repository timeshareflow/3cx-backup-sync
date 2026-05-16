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

    // Check permissions for non-admins
    if (context.role !== "super_admin" && context.role !== "admin") {
      const { data: tenantRole } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .single();

      if (tenantRole?.role !== "admin") {
        const { data: featurePerms } = await supabase
          .from("user_feature_permissions")
          .select("can_view_faxes")
          .eq("user_id", context.userId)
          .eq("tenant_id", context.tenantId)
          .single();

        if (!featurePerms?.can_view_faxes) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    let query = supabase
      .from("faxes")
      .select("*")
      .eq("id", id);

    if (context.role !== "super_admin" && context.tenantId) {
      query = query.eq("tenant_id", context.tenantId);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return NextResponse.json({ error: "Fax not found" }, { status: 404 });
    }

    let signedUrl: string;

    if (data.storage_backend === "supabase") {
      const { data: signedUrlData, error: urlError } = await supabase
        .storage
        .from("backupwiz-files")
        .createSignedUrl(data.storage_path, 3600);

      if (urlError || !signedUrlData?.signedUrl) {
        console.error("Failed to generate Supabase signed URL for fax:", data.storage_path, urlError?.message);
        return NextResponse.json({ error: "Failed to generate URL" }, { status: 500 });
      }
      signedUrl = signedUrlData.signedUrl;
    } else {
      try {
        signedUrl = await getSpacesSignedUrl(data.storage_path, 3600);
      } catch (spacesError) {
        console.error("Failed to generate DO Spaces signed URL for fax:", data.storage_path, spacesError);
        return NextResponse.json({ error: "Failed to generate URL" }, { status: 500 });
      }
    }

    return NextResponse.json({
      url: signedUrl,
      filename: data.original_filename,
      mime_type: data.mime_type || "application/pdf",
    });
  } catch (error) {
    console.error("Error in fax download API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
