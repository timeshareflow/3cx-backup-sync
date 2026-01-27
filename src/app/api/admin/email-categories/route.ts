import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

interface EmailCategory {
  id: string;
  category: string;
  label: string;
  description: string;
  from_email: string | null;
  from_name: string | null;
}

const DEFAULT_CATEGORIES = [
  { category: "welcome", label: "Welcome Emails", description: "New user registration and invitations" },
  { category: "billing", label: "Billing Emails", description: "Invoices, payment confirmations, subscription updates" },
  { category: "notifications", label: "Notification Emails", description: "Sync alerts, storage warnings, system notifications" },
  { category: "security", label: "Security Emails", description: "Password resets, 2FA codes, login alerts" },
];

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createAdminClient();

    const { data: categories, error } = await supabase
      .from("email_categories")
      .select("*")
      .order("category");

    if (error) {
      console.error("Error fetching email categories:", error);
      // If table doesn't exist, try to create default categories
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json({
          categories: DEFAULT_CATEGORIES.map((c, i) => ({
            id: `temp-${i}`,
            ...c,
            from_email: null,
            from_name: null,
          })),
          tableExists: false,
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If no categories exist, seed them first
    if (!categories || categories.length === 0) {
      console.log("No categories found, seeding defaults...");
      const seededCategories: EmailCategory[] = [];

      for (const cat of DEFAULT_CATEGORIES) {
        const { data, error: insertError } = await supabase
          .from("email_categories")
          .insert({
            category: cat.category,
            label: cat.label,
            description: cat.description,
            from_email: null,
            from_name: null,
          })
          .select()
          .single();

        if (insertError) {
          console.error("Error seeding category:", insertError);
        } else if (data) {
          seededCategories.push(data);
        }
      }

      if (seededCategories.length > 0) {
        return NextResponse.json({ categories: seededCategories });
      }

      // Fallback to temp IDs if seeding failed
      return NextResponse.json({
        categories: DEFAULT_CATEGORIES.map((c, i) => ({
          id: `temp-${i}`,
          ...c,
          from_email: null,
          from_name: null,
        })),
      });
    }

    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Error in email categories API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { categories } = body as { categories: EmailCategory[] };

    if (!categories || !Array.isArray(categories)) {
      return NextResponse.json(
        { error: "Categories array is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Upsert each category
    const upsertedCategories: EmailCategory[] = [];
    const errors: string[] = [];

    for (const cat of categories) {
      // Skip temp/default IDs - these need to be inserted fresh
      const isNewRecord = !cat.id || cat.id.startsWith("temp-") || cat.id.startsWith("default-");

      if (isNewRecord) {
        // Insert new record
        const { data, error } = await supabase
          .from("email_categories")
          .upsert(
            {
              category: cat.category,
              label: cat.label,
              description: cat.description,
              from_email: cat.from_email || null,
              from_name: cat.from_name || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "category" }
          )
          .select()
          .single();

        if (error) {
          console.error("Error upserting category:", cat.category, error);
          errors.push(`${cat.category}: ${error.message}`);
        } else if (data) {
          upsertedCategories.push(data);
        }
      } else {
        // Update existing record by ID
        const { data, error } = await supabase
          .from("email_categories")
          .update({
            from_email: cat.from_email || null,
            from_name: cat.from_name || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cat.id)
          .select()
          .single();

        if (error) {
          console.error("Error updating category:", cat.category, error);
          errors.push(`${cat.category}: ${error.message}`);
        } else if (data) {
          upsertedCategories.push(data);
        }
      }
    }

    if (errors.length > 0 && upsertedCategories.length === 0) {
      return NextResponse.json(
        { error: `Failed to save categories: ${errors.join(", ")}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      categories: upsertedCategories,
      warnings: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error in email categories API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
