import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

    const supabase = await createClient();

    const { data: categories, error } = await supabase
      .from("email_categories")
      .select("*")
      .order("category");

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching email categories:", error);
      // Return defaults if table doesn't exist
      return NextResponse.json({
        categories: DEFAULT_CATEGORIES.map((c, i) => ({
          id: `default-${i}`,
          ...c,
          from_email: null,
          from_name: null,
        })),
      });
    }

    // If no categories exist, return defaults
    if (!categories || categories.length === 0) {
      return NextResponse.json({
        categories: DEFAULT_CATEGORIES.map((c, i) => ({
          id: `default-${i}`,
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

    const supabase = await createClient();

    // Upsert each category
    const upsertedCategories: EmailCategory[] = [];

    for (const cat of categories) {
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
        console.error("Error upserting category:", error);
        // Continue with other categories
      } else if (data) {
        upsertedCategories.push(data);
      }
    }

    return NextResponse.json({ categories: upsertedCategories });
  } catch (error) {
    console.error("Error in email categories API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
