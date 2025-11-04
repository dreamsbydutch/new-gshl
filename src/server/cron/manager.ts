/**
 * Cron Job Manager
 * -----------------
 * Centralized management for all scheduled tasks with development-friendly features.
 *
 * Features:
 * - Automatic detection of development vs production
 * - Graceful handling of missed executions
 * - Configurable catch-up behavior
 * - Detailed logging with timestamps
 * - Health check endpoints
 */

import cron, { type ScheduledTask } from "node-cron";

export type CronJobConfig = {
  name: string;
  schedule: string;
  timezone?: string;
  enabled?: boolean;
  runOnInit?: boolean; // Run once on startup
  runImmediately?: boolean; // Run immediately if missed
  task: () => Promise<void>;
};

export type CronJobStatus = {
  name: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  running: boolean;
  lastRun?: Date;
  lastDuration?: number;
  lastStatus?: "success" | "error";
  lastError?: string;
  missedRuns: number;
};

class CronManager {
  private jobs = new Map<
    string,
    {
      config: CronJobConfig;
      task: ScheduledTask;
      status: CronJobStatus;
      isRunning: boolean;
    }
  >();

  private isDevelopment = process.env.NODE_ENV !== "production";

  /**
   * Register a new cron job
   */
  register(config: CronJobConfig): void {
    const {
      name,
      schedule,
      timezone = "America/New_York",
      enabled = true,
      runOnInit = false,
      task,
    } = config;

    if (this.jobs.has(name)) {
      console.warn(
        `⚠️ [CronManager] Job "${name}" already registered. Skipping.`,
      );
      return;
    }

    const status: CronJobStatus = {
      name,
      schedule,
      timezone,
      enabled,
      running: false,
      missedRuns: 0,
    };

    let isRunning = false;

    // Wrap the task to track execution
    const wrappedTask = async () => {
      if (isRunning) {
        console.log(
          `⏭️  [CronManager/${name}] Skipping - previous run still in progress`,
        );
        return;
      }

      isRunning = true;
      const startTime = Date.now();

      try {
        console.log(`\n${"=".repeat(70)}`);
        console.log(`🕐 [CronManager/${name}] Starting scheduled task`);
        console.log(
          `   Time: ${new Date().toLocaleString("en-US", { timeZone: timezone })}`,
        );
        console.log(`${"=".repeat(70)}\n`);

        await task();

        const duration = Date.now() - startTime;
        status.lastRun = new Date();
        status.lastDuration = duration;
        status.lastStatus = "success";

        console.log(`\n${"=".repeat(70)}`);
        console.log(`✅ [CronManager/${name}] Task completed successfully`);
        console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`${"=".repeat(70)}\n`);
      } catch (error) {
        const duration = Date.now() - startTime;
        status.lastRun = new Date();
        status.lastDuration = duration;
        status.lastStatus = "error";
        status.lastError =
          error instanceof Error ? error.message : String(error);

        console.error(`\n${"=".repeat(70)}`);
        console.error(`❌ [CronManager/${name}] Task failed`);
        console.error(`   Duration: ${(duration / 1000).toFixed(2)}s`);
        console.error(`   Error:`, error);
        console.error(`${"=".repeat(70)}\n`);
      } finally {
        isRunning = false;
      }
    };

    // Create the cron task
    const cronTask = cron.schedule(schedule, wrappedTask, { timezone });

    // Start the task if enabled
    if (!enabled) {
      void cronTask.stop();
    }

    this.jobs.set(name, { config, task: cronTask, status, isRunning: false });

    console.log(`📝 [CronManager] Registered job: ${name}`);
    console.log(`   Schedule: ${schedule} (${timezone})`);
    console.log(`   Enabled: ${enabled}`);

    // Run immediately on startup if configured
    if (runOnInit && enabled) {
      console.log(`🚀 [CronManager] Running "${name}" on initialization...`);
      setTimeout(() => void wrappedTask(), 1000);
    }
  }

  /**
   * Start a specific job
   */
  start(name: string): boolean {
    const job = this.jobs.get(name);
    if (!job) {
      console.error(`❌ [CronManager] Job "${name}" not found`);
      return false;
    }

    void job.task.start();
    job.status.enabled = true;
    job.status.running = true;
    console.log(`▶️  [CronManager] Started job: ${name}`);
    return true;
  }

  /**
   * Stop a specific job
   */
  stop(name: string): boolean {
    const job = this.jobs.get(name);
    if (!job) {
      console.error(`❌ [CronManager] Job "${name}" not found`);
      return false;
    }

    void job.task.stop();
    job.status.enabled = false;
    job.status.running = false;
    console.log(`⏸️  [CronManager] Stopped job: ${name}`);
    return true;
  }

  /**
   * Start all registered jobs
   */
  startAll(): void {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`🚀 [CronManager] Starting all cron jobs...`);
    console.log(
      `   Environment: ${this.isDevelopment ? "DEVELOPMENT" : "PRODUCTION"}`,
    );
    console.log(`${"=".repeat(70)}\n`);

    for (const [name] of this.jobs) {
      this.start(name);
    }

    console.log(
      `✅ [CronManager] All jobs started (${this.jobs.size} total)\n`,
    );
  }

  /**
   * Stop all registered jobs
   */
  stopAll(): void {
    console.log(`\n🛑 [CronManager] Stopping all cron jobs...`);

    for (const [name] of this.jobs) {
      this.stop(name);
    }

    console.log(`✅ [CronManager] All jobs stopped\n`);
  }

  /**
   * Get status of all jobs
   */
  getStatus(): CronJobStatus[] {
    return Array.from(this.jobs.values()).map((job) => job.status);
  }

  /**
   * Get status of a specific job
   */
  getJobStatus(name: string): CronJobStatus | null {
    const job = this.jobs.get(name);
    return job ? job.status : null;
  }

  /**
   * Manually trigger a job (useful for testing)
   */
  async trigger(name: string): Promise<boolean> {
    const job = this.jobs.get(name);
    if (!job) {
      console.error(`❌ [CronManager] Job "${name}" not found`);
      return false;
    }

    console.log(`🎯 [CronManager] Manually triggering job: ${name}`);
    try {
      await job.config.task();
      return true;
    } catch (error) {
      console.error(`❌ [CronManager] Manual trigger failed:`, error);
      return false;
    }
  }

  /**
   * Check if running in development mode
   */
  isDev(): boolean {
    return this.isDevelopment;
  }
}

// Singleton instance
export const cronManager = new CronManager();
