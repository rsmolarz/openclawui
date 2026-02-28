import { storage } from "./storage";
import type { AutomationJob } from "@shared/schema";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

function parseCronSchedule(schedule: string): { matches: (date: Date) => boolean } {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { matches: () => false };
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  function fieldMatches(field: string, value: number, max: number): boolean {
    if (field === "*") return true;
    if (field.includes("/")) {
      const [base, step] = field.split("/");
      const stepNum = parseInt(step, 10);
      if (isNaN(stepNum) || stepNum <= 0) return false;
      const baseNum = base === "*" ? 0 : parseInt(base, 10);
      return (value - baseNum) % stepNum === 0 && value >= baseNum;
    }
    if (field.includes(",")) {
      return field.split(",").some(f => parseInt(f, 10) === value);
    }
    if (field.includes("-")) {
      const [start, end] = field.split("-").map(Number);
      return value >= start && value <= end;
    }
    return parseInt(field, 10) === value;
  }

  return {
    matches(date: Date) {
      return (
        fieldMatches(minute, date.getMinutes(), 59) &&
        fieldMatches(hour, date.getHours(), 23) &&
        fieldMatches(dayOfMonth, date.getDate(), 31) &&
        fieldMatches(month, date.getMonth() + 1, 12) &&
        fieldMatches(dayOfWeek, date.getDay(), 6)
      );
    },
  };
}

function getNextRun(schedule: string): Date {
  const cron = parseCronSchedule(schedule);
  const now = new Date();
  const check = new Date(now);
  check.setSeconds(0, 0);
  check.setMinutes(check.getMinutes() + 1);

  for (let i = 0; i < 60 * 24 * 7; i++) {
    if (cron.matches(check)) return new Date(check);
    check.setMinutes(check.getMinutes() + 1);
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  return fallback;
}

async function executeJob(job: AutomationJob): Promise<void> {
  const run = await storage.createAutomationRun({
    jobId: job.id,
    status: "running",
    output: null,
  });

  try {
    const { executeSSHRawCommand, getSSHConfig } = await import("./ssh");
    const sshConfig = getSSHConfig();

    if (!sshConfig) {
      await storage.updateAutomationRun(run.id, {
        status: "failed",
        output: "SSH not configured",
        completedAt: new Date(),
      });
      return;
    }

    const result = await executeSSHRawCommand(job.command, sshConfig);

    await storage.updateAutomationRun(run.id, {
      status: result.success ? "completed" : "failed",
      output: result.output || result.error || "No output",
      completedAt: new Date(),
    });

    await storage.updateAutomationJob(job.id, {
      lastRun: new Date(),
      nextRun: getNextRun(job.schedule),
    });
  } catch (error: any) {
    await storage.updateAutomationRun(run.id, {
      status: "failed",
      output: error.message || "Unknown error",
      completedAt: new Date(),
    });
  }
}

async function checkSchedules(): Promise<void> {
  try {
    const jobs = await storage.getAutomationJobs();
    const now = new Date();

    for (const job of jobs) {
      if (!job.enabled) continue;

      const cron = parseCronSchedule(job.schedule);
      const checkTime = new Date(now);
      checkTime.setSeconds(0, 0);

      if (cron.matches(checkTime)) {
        if (job.lastRun) {
          const timeSinceLastRun = now.getTime() - new Date(job.lastRun).getTime();
          if (timeSinceLastRun < 55000) continue;
        }
        console.log(`[Automation] Running job: ${job.name}`);
        executeJob(job).catch(err =>
          console.error(`[Automation] Job ${job.name} failed:`, err.message)
        );
      }
    }
  } catch (err: any) {
    if (!checkSchedules._errLogged) {
      console.error("[Automation] Schedule check error:", err.message);
      checkSchedules._errLogged = true;
    }
  }
}
checkSchedules._errLogged = false;

export function startAutomationScheduler(): void {
  if (schedulerInterval) return;
  console.log("[Automation] Scheduler started (checking every 60s)");
  schedulerInterval = setInterval(checkSchedules, 60000);
  setTimeout(checkSchedules, 5000);
}

export function stopAutomationScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[Automation] Scheduler stopped");
  }
}

export { executeJob, getNextRun };
