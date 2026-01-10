import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Admin client with service role key - use only on server side
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminClient(): SupabaseClient<any, "public", any> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin credentials");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
