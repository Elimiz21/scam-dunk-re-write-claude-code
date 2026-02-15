/**
 * Lightweight Circuit Breaker for external API calls.
 *
 * States:
 *  - CLOSED: requests pass through normally
 *  - OPEN: requests are immediately rejected (fail fast)
 *  - HALF_OPEN: one probe request allowed to test recovery
 *
 * Transitions:
 *  CLOSED -> OPEN: after `failureThreshold` consecutive failures
 *  OPEN -> HALF_OPEN: after `recoveryTimeMs` elapses
 *  HALF_OPEN -> CLOSED: if probe request succeeds
 *  HALF_OPEN -> OPEN: if probe request fails
 */

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export class CircuitBreakerOpenError extends Error {
  constructor(public readonly serviceName: string) {
    super(`Circuit breaker is open for ${serviceName}`);
    this.name = "CircuitBreakerOpenError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly serviceName: string,
    private readonly failureThreshold = 5,
    private readonly recoveryTimeMs = 30_000,
  ) {}

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.recoveryTimeMs) {
        this.state = CircuitState.HALF_OPEN;
      }
    }
    return this.state;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitBreakerOpenError if circuit is open and recovery time hasn't elapsed.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitState.OPEN) {
      throw new CircuitBreakerOpenError(this.serviceName);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    // In HALF_OPEN, a single failure immediately re-opens the circuit
    if (this.state === CircuitState.HALF_OPEN || this.consecutiveFailures >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }
}

// Shared circuit breaker instances for external APIs
export const circuitBreakers = {
  fmp: new CircuitBreaker("FMP", 5, 30_000),
  alphaVantage: new CircuitBreaker("AlphaVantage", 5, 30_000),
  coinGecko: new CircuitBreaker("CoinGecko", 5, 30_000),
} as const;
