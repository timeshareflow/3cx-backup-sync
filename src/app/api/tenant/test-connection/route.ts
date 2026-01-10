import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Pool } from "pg";
import { Client as SSHClient } from "ssh2";
import * as net from "net";

export async function POST(request: Request) {
  let sshClient: SSHClient | null = null;
  let server: net.Server | null = null;
  let pool: Pool | null = null;

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

    // Validate required fields
    if (!body.host || !body.ssh_user || !body.ssh_password || !body.db_password) {
      return NextResponse.json(
        { success: false, error: "Missing required connection parameters" },
        { status: 400 }
      );
    }

    // Test connection via SSH tunnel
    const result = await testConnectionViaSshTunnel({
      sshHost: body.host,
      sshPort: body.ssh_port || 22,
      sshUser: body.ssh_user,
      sshPassword: body.ssh_password,
      dbPassword: body.db_password,
    });

    if (result.success) {
      return NextResponse.json({ success: true, message: "Connection successful via SSH tunnel" });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error testing connection:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}

interface TestConnectionParams {
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshPassword: string;
  dbPassword: string;
}

async function testConnectionViaSshTunnel(params: TestConnectionParams): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const sshClient = new SSHClient();
    let localServer: net.Server | null = null;
    let pool: Pool | null = null;
    let resolved = false;

    const cleanup = async () => {
      if (pool) {
        try { await pool.end(); } catch {}
      }
      if (localServer) {
        try { localServer.close(); } catch {}
      }
      try { sshClient.end(); } catch {}
    };

    const fail = (error: string) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ success: false, error });
      }
    };

    // Set timeout for the whole operation
    const timeout = setTimeout(() => {
      fail("Connection timeout - check if SSH port is accessible");
    }, 15000);

    sshClient.on("error", (err) => {
      clearTimeout(timeout);
      fail(`SSH connection failed: ${err.message}`);
    });

    sshClient.on("ready", () => {
      // Create a local server that forwards to PostgreSQL via SSH
      localServer = net.createServer((socket) => {
        sshClient.forwardOut(
          "127.0.0.1",
          0,
          "127.0.0.1",
          5432,
          (err, stream) => {
            if (err) {
              socket.end();
              return;
            }
            socket.pipe(stream).pipe(socket);
          }
        );
      });

      localServer.listen(0, "127.0.0.1", async () => {
        const addr = localServer!.address();
        if (!addr || typeof addr === "string") {
          clearTimeout(timeout);
          fail("Failed to get local port");
          return;
        }

        const localPort = addr.port;

        // Now test PostgreSQL connection through the tunnel
        pool = new Pool({
          host: "127.0.0.1",
          port: localPort,
          database: "database_single",
          user: "phonesystem",
          password: params.dbPassword,
          connectionTimeoutMillis: 10000,
          ssl: false,
        });

        try {
          const client = await pool.connect();
          await client.query("SELECT 1");
          client.release();

          clearTimeout(timeout);
          resolved = true;
          await cleanup();
          resolve({ success: true });
        } catch (dbError) {
          clearTimeout(timeout);
          const err = dbError as Error;
          fail(`Database connection failed: ${err.message}`);
        }
      });

      localServer.on("error", (err) => {
        clearTimeout(timeout);
        fail(`Local server error: ${err.message}`);
      });
    });

    // Connect to SSH
    sshClient.connect({
      host: params.sshHost,
      port: params.sshPort,
      username: params.sshUser,
      password: params.sshPassword,
      readyTimeout: 10000,
    });
  });
}
