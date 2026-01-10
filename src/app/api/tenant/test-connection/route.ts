import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Pool } from "pg";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's tenant or verify admin status
    const { data: userTenant } = await supabase
      .from("user_tenants")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .single();

    if (!userTenant) {
      // Check if super_admin
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (userTenant.role !== "admin") {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Test PostgreSQL connection
    const pool = new Pool({
      host: body.host,
      port: body.port || 5432,
      database: body.database || "database_single",
      user: body.user || "postgres",
      password: body.password,
      connectionTimeoutMillis: 5000,
      ssl: false,
    });

    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      await pool.end();

      return NextResponse.json({ success: true, message: "Connection successful" });
    } catch (dbError) {
      await pool.end();
      console.error("Database connection test failed:", dbError);
      return NextResponse.json(
        { success: false, error: "Connection failed" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error testing connection:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
