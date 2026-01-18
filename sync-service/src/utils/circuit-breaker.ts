import { logger } from "./logger";

export type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerConfig {
  failureThreshold: number;     // Number of failures before opening circuit
  successThreshold: number;     // Number of successes in half-open to close circuit
  timeout: number;              // Time in ms before attempting half-open state
  resetTimeout: number;         // Time in ms to reset failure count after success
}

interface CircuitInfo {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastStateChange: number;
  consecutiveSuccesses: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,          // Open after 3 consecutive failures
  successThreshold: 2,          // Close after 2 successes in half-open
  timeout: 5 * 60 * 1000,       // Wait 5 minutes before half-open
  resetTimeout: 10 * 60 * 1000, // Reset failure count after 10 min of success
};

// Store circuit state per tenant
const circuits: Map<string, CircuitInfo> = new Map();

function getCircuitInfo(tenantId: string): CircuitInfo {
  if (!circuits.has(tenantId)) {
    circuits.set(tenantId, {
      state: "closed",
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastStateChange: Date.now(),
      consecutiveSuccesses: 0,
    });
  }
  return circuits.get(tenantId)!;
}

export function canExecute(
  tenantId: string,
  config: Partial<CircuitBreakerConfig> = {}
): { allowed: boolean; state: CircuitState; reason?: string } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const circuit = getCircuitInfo(tenantId);
  const now = Date.now();

  // Check if we should transition from open to half-open
  if (
    circuit.state === "open" &&
    circuit.lastFailure &&
    now - circuit.lastFailure >= cfg.timeout
  ) {
    circuit.state = "half-open";
    circuit.lastStateChange = now;
    logger.info("Circuit breaker transitioning to half-open", {
      tenantId,
      timeSinceFailure: `${Math.round((now - circuit.lastFailure) / 1000)}s`,
    });
  }

  switch (circuit.state) {
    case "closed":
      return { allowed: true, state: "closed" };

    case "half-open":
      // Allow limited requests in half-open state
      return {
        allowed: true,
        state: "half-open",
        reason: "Testing if service recovered",
      };

    case "open":
      const timeRemaining = circuit.lastFailure
        ? Math.max(0, cfg.timeout - (now - circuit.lastFailure))
        : 0;
      return {
        allowed: false,
        state: "open",
        reason: `Circuit open. Will retry in ${Math.round(timeRemaining / 1000)}s`,
      };

    default:
      return { allowed: true, state: "closed" };
  }
}

export function recordSuccess(
  tenantId: string,
  config: Partial<CircuitBreakerConfig> = {}
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const circuit = getCircuitInfo(tenantId);

  circuit.consecutiveSuccesses++;
  circuit.successes++;

  if (circuit.state === "half-open") {
    if (circuit.consecutiveSuccesses >= cfg.successThreshold) {
      circuit.state = "closed";
      circuit.failures = 0;
      circuit.lastFailure = null;
      circuit.lastStateChange = Date.now();
      logger.info("Circuit breaker closed after successful recovery", {
        tenantId,
        consecutiveSuccesses: circuit.consecutiveSuccesses,
      });
    } else {
      logger.debug("Circuit breaker half-open success recorded", {
        tenantId,
        consecutiveSuccesses: circuit.consecutiveSuccesses,
        needed: cfg.successThreshold,
      });
    }
  } else if (circuit.state === "closed") {
    // Reset failure count after sustained success
    if (
      circuit.failures > 0 &&
      circuit.lastFailure &&
      Date.now() - circuit.lastFailure >= cfg.resetTimeout
    ) {
      circuit.failures = 0;
      circuit.lastFailure = null;
      logger.debug("Circuit breaker failure count reset after sustained success", {
        tenantId,
      });
    }
  }
}

export function recordFailure(
  tenantId: string,
  error: string,
  config: Partial<CircuitBreakerConfig> = {}
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const circuit = getCircuitInfo(tenantId);

  circuit.failures++;
  circuit.lastFailure = Date.now();
  circuit.consecutiveSuccesses = 0;

  if (circuit.state === "half-open") {
    // Any failure in half-open goes back to open
    circuit.state = "open";
    circuit.lastStateChange = Date.now();
    logger.warn("Circuit breaker reopened after failure in half-open state", {
      tenantId,
      error,
    });
  } else if (circuit.state === "closed" && circuit.failures >= cfg.failureThreshold) {
    circuit.state = "open";
    circuit.lastStateChange = Date.now();
    logger.error("Circuit breaker opened due to consecutive failures", {
      tenantId,
      failures: circuit.failures,
      threshold: cfg.failureThreshold,
      lastError: error,
    });
  } else {
    logger.warn("Circuit breaker failure recorded", {
      tenantId,
      failures: circuit.failures,
      threshold: cfg.failureThreshold,
      error,
    });
  }
}

export function getCircuitState(tenantId: string): CircuitInfo {
  return getCircuitInfo(tenantId);
}

export function getAllCircuitStates(): Record<string, CircuitInfo> {
  const states: Record<string, CircuitInfo> = {};
  circuits.forEach((info, tenantId) => {
    states[tenantId] = { ...info };
  });
  return states;
}

export function resetCircuit(tenantId: string): void {
  circuits.delete(tenantId);
  logger.info("Circuit breaker reset", { tenantId });
}

export function resetAllCircuits(): void {
  circuits.clear();
  logger.info("All circuit breakers reset");
}
