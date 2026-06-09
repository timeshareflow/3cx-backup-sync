import { NextResponse } from "next/server";
import { Client as SSHClient } from "ssh2";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const INSTALL_DIR = "/opt/3cx-sync/3cx-backup-sync";
const SERVICE_DIR = `${INSTALL_DIR}/sync-service`;
const GITHUB_REPO = "https://github.com/timeshareflow/3cx-backup-sync.git";

type Sender = (type: "log" | "error" | "success" | "done", msg: string) => void;

function buildEnvContent(host: string, dbPassword: string): string {
  const lines = [
    "# 3CX BackupWiz Sync Service — auto-installed",
    "",
    "# Supabase",
    `SUPABASE_URL=${process.env.SUPABASE_URL || ""}`,
    `SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`,
    `DATABASE_URL=${process.env.DATABASE_URL || ""}`,
    "",
    "# DigitalOcean Spaces",
    `DO_SPACES_KEY=${process.env.DO_SPACES_KEY || ""}`,
    `DO_SPACES_SECRET=${process.env.DO_SPACES_SECRET || ""}`,
    `DO_SPACES_BUCKET=${process.env.DO_SPACES_BUCKET || "3cxbackupwiz"}`,
    `DO_SPACES_ENDPOINT=${process.env.DO_SPACES_ENDPOINT || "nyc3.digitaloceanspaces.com"}`,
    `DO_SPACES_REGION=${process.env.DO_SPACES_REGION || "nyc3"}`,
    "",
    "# 3CX Local PostgreSQL",
    "THREECX_DB_HOST=127.0.0.1",
    "THREECX_DB_PORT=5432",
    "THREECX_DB_NAME=database_single",
    "THREECX_DB_USER=phonesystem",
    `THREECX_DB_PASSWORD=${dbPassword}`,
    "",
    "# Sync intervals",
    "SYNC_INTERVAL_CHAT=30",
    "SYNC_INTERVAL_CDR=10",
    "SYNC_INTERVAL_MEDIA=10",
    "SYNC_INTERVAL_RECORDINGS=30",
    "",
    "# Logging",
    "LOG_LEVEL=info",
    "NODE_OPTIONS=--dns-result-order=ipv4first",
  ];
  return lines.join("\n") + "\n";
}

function sshConnect(params: {
  host: string;
  port: number;
  username: string;
  password: string;
}): Promise<SSHClient> {
  return new Promise((resolve, reject) => {
    const client = new SSHClient();
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error("SSH connection timed out"));
    }, 15_000);

    client.on("ready", () => {
      clearTimeout(timeout);
      resolve(client);
    });
    client.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    client.connect({
      host: params.host,
      port: params.port,
      username: params.username,
      password: params.password,
      readyTimeout: 12_000,
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSftp(client: SSHClient): Promise<any> {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) reject(err);
      else resolve(sftp);
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sftpWriteFile(sftp: any, remotePath: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(content, "utf8");
    const writeStream = sftp.createWriteStream(remotePath, { flags: "w", mode: 0o600 });
    writeStream.on("error", reject);
    writeStream.on("close", resolve);
    writeStream.end(buffer);
  });
}

function sshMkdir(client: SSHClient, dir: string): Promise<void> {
  return new Promise((resolve) => {
    client.exec(`mkdir -p "${dir}"`, (err, stream) => {
      if (err) { resolve(); return; }
      stream.on("close", () => resolve());
      stream.resume();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (stream as any).stderr?.resume();
    });
  });
}

function sshExec(client: SSHClient, command: string, send: Sender): Promise<number> {
  return new Promise((resolve, reject) => {
    client.exec(command, { pty: false }, (err, stream) => {
      if (err) return reject(err);

      let exitCode = 0;

      stream.on("data", (data: Buffer) => {
        const text = data.toString();
        for (const line of text.split("\n")) {
          if (line.trim()) send("log", line);
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (stream as any).stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        for (const line of text.split("\n")) {
          if (line.trim()) send("log", `[stderr] ${line}`);
        }
      });

      stream.on("close", (code: number) => {
        exitCode = code ?? 0;
        resolve(exitCode);
      });

      stream.on("error", reject);
    });
  });
}

async function runInstall(params: {
  host: string;
  port: number;
  username: string;
  password: string;
  dbPassword: string;
}, send: Sender): Promise<void> {
  const { host, port, username, password, dbPassword } = params;

  send("log", `Connecting to ${host}:${port}...`);
  const ssh = await sshConnect({ host, port, username, password });
  send("log", "SSH connected");

  try {
    // Step 1: Ensure install directory exists
    send("log", `Creating ${INSTALL_DIR}...`);
    await sshMkdir(ssh, "/opt/3cx-sync");

    // Step 2: Clone or update the repo
    send("log", "Checking for existing installation...");
    let repoOutput = "";
    await new Promise<void>((resolve) => {
      ssh.exec(`[ -d "${INSTALL_DIR}/.git" ] && echo "exists" || echo "missing"`, (err, stream) => {
        if (err) { resolve(); return; }
        stream.on("data", (d: Buffer) => { repoOutput += d.toString(); });
        stream.on("close", () => resolve());
        stream.resume();
      });
    });

    if (repoOutput.trim() === "exists") {
      send("log", "Repo found — pulling latest...");
      const code = await sshExec(ssh, `cd "${INSTALL_DIR}" && git pull`, send);
      if (code !== 0) throw new Error("git pull failed");
    } else {
      send("log", "Cloning repository...");
      // Install git if not present
      await sshExec(ssh, "command -v git >/dev/null || apt-get install -y git 2>&1", send);
      const code = await sshExec(ssh, `git clone "${GITHUB_REPO}" "${INSTALL_DIR}" 2>&1`, send);
      if (code !== 0) throw new Error("git clone failed");
    }

    // Step 3: Write .env via SFTP (credentials never in shell command)
    send("log", "Writing configuration...");
    const sftp = await getSftp(ssh);
    const envContent = buildEnvContent(host, dbPassword);
    await sftpWriteFile(sftp, `${SERVICE_DIR}/.env`, envContent);
    sftp.end();
    send("log", ".env written");

    // Step 4: Install PM2 if missing
    send("log", "Checking PM2...");
    await sshExec(ssh, "command -v pm2 >/dev/null 2>&1 || npm install -g pm2 2>&1", send);

    // Step 5: npm install + build
    send("log", "Installing dependencies...");
    let code = await sshExec(ssh, `cd "${SERVICE_DIR}" && npm install 2>&1`, send);
    if (code !== 0) throw new Error("npm install failed");

    send("log", "Building...");
    code = await sshExec(ssh, `cd "${SERVICE_DIR}" && npm run build 2>&1`, send);
    if (code !== 0) throw new Error("npm build failed");

    // Step 6: Apply PostgreSQL LISTEN/NOTIFY trigger
    send("log", "Applying real-time trigger...");
    const triggerSql = `${INSTALL_DIR}/scripts/3cx-realtime-trigger.sql`;
    await sshExec(
      ssh,
      `[ -f "${triggerSql}" ] && PGPASSWORD="${dbPassword.replace(/"/g, '\\"')}" psql -h 127.0.0.1 -U phonesystem database_single -f "${triggerSql}" 2>&1 || echo "Trigger file not found — skipping"`,
      send
    );

    // Step 7: Start or restart PM2
    send("log", "Starting sync service...");
    let pm2Output = "";
    await new Promise<void>((resolve) => {
      ssh.exec("pm2 list 2>/dev/null", (err, stream) => {
        if (err) { resolve(); return; }
        stream.on("data", (d: Buffer) => { pm2Output += d.toString(); });
        stream.on("close", () => resolve());
        stream.resume();
      });
    });

    if (pm2Output.includes("3cx-sync")) {
      send("log", "Restarting existing PM2 process...");
      await sshExec(ssh, "pm2 restart 3cx-sync --update-env && pm2 save", send);
    } else {
      send("log", "Starting new PM2 process...");
      code = await sshExec(
        ssh,
        `cd "${SERVICE_DIR}" && pm2 start dist/index.js --name 3cx-sync --time && pm2 save`,
        send
      );
      if (code !== 0) throw new Error("PM2 start failed");
    }

    // Step 8: Enable PM2 on boot
    send("log", "Enabling PM2 on system boot...");
    await sshExec(
      ssh,
      "env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash 2>/dev/null || true",
      send
    );
    await sshExec(ssh, "pm2 save", send);

    send("success", "Sync agent installed and running!");
  } finally {
    ssh.end();
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify admin or super_admin
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSuper = profile?.role === "super_admin";

  if (!isSuper) {
    const { data: membership } = await supabase
      .from("user_tenants")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (membership?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const { host, ssh_port = 22, ssh_user, ssh_password, db_password } = body;

  if (!host || !ssh_user || !ssh_password || !db_password) {
    return NextResponse.json({ error: "Missing required fields: host, ssh_user, ssh_password, db_password" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: Sender = (type, msg) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type, msg })}\n\n`)
          );
        } catch { /* stream closed */ }
      };

      try {
        await runInstall(
          { host, port: parseInt(String(ssh_port)), username: ssh_user, password: ssh_password, dbPassword: db_password },
          send
        );
        send("done", "done");
      } catch (err) {
        send("error", (err as Error).message || "Installation failed");
        send("done", "done");
      } finally {
        try { controller.close(); } catch { /* ignore */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
