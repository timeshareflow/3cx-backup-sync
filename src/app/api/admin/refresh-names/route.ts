import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant found" }, { status: 400 });
    }

    // Check admin access
    const supabase = createAdminClient();
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", context.userId)
      .single();

    const isAdmin = profile?.role === "super_admin" || profile?.role === "admin";
    if (!isAdmin) {
      const { data: tenantRole } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .single();
      if (tenantRole?.role !== "admin") {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
    }

    // Get all extensions with current names
    const { data: extensions } = await supabase
      .from("extensions")
      .select("id, extension_number, display_name, first_name, last_name")
      .eq("tenant_id", context.tenantId);

    if (!extensions || extensions.length === 0) {
      return NextResponse.json({
        success: true,
        participantsUpdated: 0,
        conversationsUpdated: 0,
        message: "No extensions found",
      });
    }

    let participantsUpdated = 0;
    const affectedConversationIds = new Set<string>();

    for (const ext of extensions) {
      const displayName =
        ext.display_name ||
        [ext.first_name, ext.last_name].filter(Boolean).join(" ") ||
        null;

      if (!displayName) continue;

      const expectedName = `${displayName} (${ext.extension_number})`;

      // Update all participants with this extension_id that have a different name
      const { data: updated } = await supabase
        .from("participants")
        .update({ external_name: expectedName })
        .eq("extension_id", ext.id)
        .neq("external_name", expectedName)
        .select("conversation_id");

      if (updated && updated.length > 0) {
        participantsUpdated += updated.length;
        for (const p of updated) {
          affectedConversationIds.add(p.conversation_id);
        }
      }
    }

    // Rebuild conversation names for all affected conversations
    let conversationsUpdated = 0;
    for (const convId of affectedConversationIds) {
      // Get conversation info
      const { data: conv } = await supabase
        .from("conversations")
        .select("is_group_chat")
        .eq("id", convId)
        .single();

      if (conv?.is_group_chat) continue;

      // Get participants for this conversation
      const { data: participants } = await supabase
        .from("participants")
        .select("external_name")
        .eq("conversation_id", convId);

      if (!participants || participants.length === 0) continue;

      const names = participants
        .map((p) => p.external_name)
        .filter(Boolean)
        .sort()
        .join(", ");

      if (names) {
        await supabase
          .from("conversations")
          .update({ conversation_name: names })
          .eq("id", convId);
        conversationsUpdated++;
      }
    }

    return NextResponse.json({
      success: true,
      participantsUpdated,
      conversationsUpdated,
      message: participantsUpdated > 0
        ? `Updated ${participantsUpdated} participant names and ${conversationsUpdated} conversation names`
        : "All names are already up to date",
    });
  } catch (error) {
    console.error("Error refreshing names:", error);
    return NextResponse.json(
      { error: "Failed to refresh names" },
      { status: 500 }
    );
  }
}
