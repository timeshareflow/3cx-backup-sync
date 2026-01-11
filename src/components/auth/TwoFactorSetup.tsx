"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Shield, ShieldCheck, ShieldOff, Copy, Check, AlertTriangle, Loader2 } from "lucide-react";
import QRCode from "qrcode";

interface TwoFactorSetupProps {
  onStatusChange?: (enabled: boolean) => void;
}

export function TwoFactorSetup({ onStatusChange }: TwoFactorSetupProps) {
  const [status, setStatus] = useState<{
    enabled: boolean;
    verifiedAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState<{
    secret: string;
    otpauthUrl: string;
    qrCode: string;
  } | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [step, setStep] = useState<"status" | "setup" | "verify" | "backup" | "disable">("status");
  const [processing, setProcessing] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/auth/2fa");
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch 2FA status:", error);
    } finally {
      setLoading(false);
    }
  };

  const startSetup = async () => {
    setError("");
    setProcessing(true);
    try {
      const response = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to start 2FA setup");
        return;
      }

      // Generate QR code
      const qrCode = await QRCode.toDataURL(data.otpauthUrl);

      setSetupData({
        secret: data.secret,
        otpauthUrl: data.otpauthUrl,
        qrCode,
      });
      setStep("setup");
    } catch (error) {
      setError("Failed to start 2FA setup");
    } finally {
      setProcessing(false);
    }
  };

  const verifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setError("");
    setProcessing(true);
    try {
      const response = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code: verificationCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Verification failed");
        return;
      }

      setBackupCodes(data.backupCodes);
      setStep("backup");
      setStatus({ enabled: true, verifiedAt: new Date().toISOString() });
      onStatusChange?.(true);
    } catch (error) {
      setError("Verification failed");
    } finally {
      setProcessing(false);
    }
  };

  const disable2FA = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setError("");
    setProcessing(true);
    try {
      const response = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable", code: verificationCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to disable 2FA");
        return;
      }

      setSuccess("2FA has been disabled");
      setStatus({ enabled: false, verifiedAt: null });
      setStep("status");
      setVerificationCode("");
      onStatusChange?.(false);
    } catch (error) {
      setError("Failed to disable 2FA");
    } finally {
      setProcessing(false);
    }
  };

  const regenerateBackupCodes = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setError("");
    setProcessing(true);
    try {
      const response = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate_backup", code: verificationCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to regenerate backup codes");
        return;
      }

      setBackupCodes(data.backupCodes);
      setStep("backup");
      setVerificationCode("");
    } catch (error) {
      setError("Failed to regenerate backup codes");
    } finally {
      setProcessing(false);
    }
  };

  const copyToClipboard = async (text: string, code?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(code || "all");
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Fallback for older browsers
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          {status?.enabled ? (
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
          ) : (
            <Shield className="h-6 w-6 text-gray-400" />
          )}
          Two-Factor Authentication
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg flex items-center gap-2">
            <Check className="h-4 w-4" />
            {success}
          </div>
        )}

        {step === "status" && (
          <div>
            <p className="text-gray-600 mb-4">
              {status?.enabled
                ? "Two-factor authentication is enabled for your account. Your account is more secure."
                : "Add an extra layer of security to your account by enabling two-factor authentication."}
            </p>

            {status?.enabled ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 rounded-lg">
                  <p className="font-medium text-emerald-800">2FA is enabled</p>
                  <p className="text-sm text-emerald-600">
                    Verified on {new Date(status.verifiedAt!).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep("backup");
                      setVerificationCode("");
                    }}
                  >
                    View/Regenerate Backup Codes
                  </Button>
                  <Button
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => {
                      setStep("disable");
                      setVerificationCode("");
                      setError("");
                    }}
                  >
                    <ShieldOff className="h-4 w-4 mr-2" />
                    Disable 2FA
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={startSetup} disabled={processing}>
                {processing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4 mr-2" />
                )}
                Enable Two-Factor Authentication
              </Button>
            )}
          </div>
        )}

        {step === "setup" && setupData && (
          <div className="space-y-6">
            <div>
              <h4 className="font-medium mb-2">Step 1: Scan QR Code</h4>
              <p className="text-sm text-gray-600 mb-4">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </p>
              <div className="flex justify-center p-4 bg-white rounded-lg border">
                <img src={setupData.qrCode} alt="2FA QR Code" className="w-48 h-48" />
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Or enter this code manually:</h4>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-gray-100 rounded-lg font-mono text-sm break-all">
                  {setupData.secret}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(setupData.secret, "secret")}
                >
                  {copiedCode === "secret" ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Step 2: Enter Verification Code</h4>
              <p className="text-sm text-gray-600 mb-4">
                Enter the 6-digit code from your authenticator app
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-center text-2xl font-mono tracking-widest focus:ring-2 focus:ring-teal-500"
                  maxLength={6}
                />
                <Button onClick={verifyCode} disabled={processing || verificationCode.length !== 6}>
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                </Button>
              </div>
            </div>

            <Button variant="outline" onClick={() => setStep("status")}>
              Cancel
            </Button>
          </div>
        )}

        {step === "backup" && (
          <div className="space-y-6">
            {backupCodes ? (
              <>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800">Save your backup codes</p>
                      <p className="text-sm text-amber-700 mt-1">
                        Store these codes in a safe place. Each code can only be used once.
                        If you lose access to your authenticator app, you can use these codes to sign in.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 bg-gray-100 rounded-lg font-mono text-sm"
                    >
                      <span>{code}</span>
                      <button
                        onClick={() => copyToClipboard(code, code)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {copiedCode === code ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-gray-400" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(backupCodes.join("\n"), "all")}
                  >
                    {copiedCode === "all" ? (
                      <>
                        <Check className="h-4 w-4 mr-2 text-emerald-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy All Codes
                      </>
                    )}
                  </Button>
                  <Button onClick={() => {
                    setStep("status");
                    setBackupCodes(null);
                    setSuccess("2FA has been enabled successfully!");
                  }}>
                    Done
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-600">
                  Enter your verification code to view or regenerate backup codes.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-center text-xl font-mono tracking-widest focus:ring-2 focus:ring-teal-500"
                    maxLength={6}
                  />
                  <Button onClick={regenerateBackupCodes} disabled={processing || verificationCode.length !== 6}>
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Regenerate Codes"}
                  </Button>
                </div>
                <Button variant="outline" onClick={() => setStep("status")}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "disable" && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">Disable Two-Factor Authentication?</p>
                  <p className="text-sm text-red-700 mt-1">
                    This will remove the extra security layer from your account.
                    Enter your verification code to confirm.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-center text-xl font-mono tracking-widest focus:ring-2 focus:ring-teal-500"
                maxLength={6}
              />
              <Button
                variant="outline"
                className="text-red-600 hover:bg-red-50"
                onClick={disable2FA}
                disabled={processing || verificationCode.length !== 6}
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disable 2FA"}
              </Button>
            </div>

            <Button variant="outline" onClick={() => {
              setStep("status");
              setVerificationCode("");
              setError("");
            }}>
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
