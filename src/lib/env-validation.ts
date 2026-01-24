/**
 * Environment variable validation for production readiness.
 * Import this module early in the application lifecycle to validate
 * that all required environment variables are set.
 */

interface EnvVarConfig {
  name: string;
  required: boolean;
  description: string;
  validator?: (value: string) => boolean;
  validationMessage?: string;
}

const ENV_VARS: EnvVarConfig[] = [
  // Supabase (required)
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    description: "Supabase project URL",
    validator: (v) => v.startsWith("https://") && v.includes(".supabase."),
    validationMessage: "Must be a valid Supabase URL (https://xxx.supabase.co)",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    description: "Supabase anonymous/public key",
    validator: (v) => v.length > 100,
    validationMessage: "Must be a valid JWT (100+ characters)",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    description: "Supabase service role key for admin operations",
    validator: (v) => v.length > 100,
    validationMessage: "Must be a valid JWT (100+ characters)",
  },

  // Security (optional - encryption features will be disabled if not set)
  {
    name: "ENCRYPTION_KEY",
    required: false,
    description: "AES encryption key for sensitive data (optional)",
    validator: (v) => v.length >= 32,
    validationMessage: "Must be at least 32 characters. Generate with: openssl rand -base64 32",
  },

  // App URL (required for production)
  {
    name: "NEXT_PUBLIC_APP_URL",
    required: process.env.NODE_ENV === "production",
    description: "Public URL of the application",
    validator: (v) => v.startsWith("https://") || v.startsWith("http://"),
    validationMessage: "Must be a valid URL starting with http:// or https://",
  },

  // Stripe (optional but needed for billing)
  {
    name: "STRIPE_SECRET_KEY",
    required: false,
    description: "Stripe secret key for payment processing",
    validator: (v) => v.startsWith("sk_"),
    validationMessage: "Must start with 'sk_'",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    required: false,
    description: "Stripe webhook signing secret",
    validator: (v) => v.startsWith("whsec_"),
    validationMessage: "Must start with 'whsec_'",
  },

  // Email (optional)
  {
    name: "SMTP_HOST",
    required: false,
    description: "SMTP server hostname for sending emails",
  },
  {
    name: "SMTP_PORT",
    required: false,
    description: "SMTP server port",
    validator: (v) => !isNaN(parseInt(v)) && parseInt(v) > 0,
    validationMessage: "Must be a valid port number",
  },
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const config of ENV_VARS) {
    const value = process.env[config.name];

    if (!value) {
      if (config.required) {
        errors.push(`Missing required: ${config.name} - ${config.description}`);
      } else {
        warnings.push(`Optional missing: ${config.name} - ${config.description}`);
      }
      continue;
    }

    if (config.validator && !config.validator(value)) {
      const message = config.validationMessage || "Invalid value";
      if (config.required) {
        errors.push(`Invalid ${config.name}: ${message}`);
      } else {
        warnings.push(`Invalid ${config.name}: ${message}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateAndLogEnvironment(): void {
  const result = validateEnvironment();

  if (result.warnings.length > 0) {
    console.warn("\n[ENV] Warnings:");
    result.warnings.forEach((w) => console.warn(`  - ${w}`));
  }

  if (!result.valid) {
    console.error("\n[ENV] WARNING: Some required environment variables are missing or invalid:");
    result.errors.forEach((e) => console.error(`  - ${e}`));
    console.error("\nThe application will continue but some features may not work correctly.\n");
    // NOTE: We intentionally do NOT call process.exit() here.
    // Crashing the entire app for missing env vars is too aggressive.
    // Individual features should handle missing config gracefully.
  } else if (result.warnings.length > 0) {
    console.log("\n[ENV] Environment validated with warnings (see above)");
  } else {
    console.log("[ENV] All required environment variables are set");
  }
}

// Export a function to get validation status without console output
export function getEnvironmentStatus(): {
  isValid: boolean;
  missingRequired: string[];
  missingOptional: string[];
} {
  const result = validateEnvironment();

  return {
    isValid: result.valid,
    missingRequired: result.errors
      .filter((e) => e.startsWith("Missing required:"))
      .map((e) => e.replace("Missing required: ", "").split(" - ")[0]),
    missingOptional: result.warnings
      .filter((w) => w.startsWith("Optional missing:"))
      .map((w) => w.replace("Optional missing: ", "").split(" - ")[0]),
  };
}
