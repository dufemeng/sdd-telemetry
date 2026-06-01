import { Config, Inject, Provide, Init } from '@midwayjs/core';
import { DailyReportRepository } from './daily-report.repository';
import { DailyReportService } from './daily-report.service';

@Provide('dailyReportScheduler')
export class DailyReportScheduler {
  @Inject('dailyReportService')
  dailyReportService!: DailyReportService;

  @Inject('dailyReportRepository')
  repo!: DailyReportRepository;

  @Config('dailyReport')
  config!: {
    scheduleEnabled: boolean;
    scheduleTime: string;
    timezone: string;
  };

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastFiredDate: string | null = null;

  @Init()
  init() {
    if (!this.config?.scheduleEnabled) return;
    void this.backfill();
    const [hour, minute] = (this.config.scheduleTime ?? '12:00').split(':').map(Number);
    this.timer = setInterval(() => {
      const now = new Date();
      const shanghai = new Date(now.toLocaleString('en-US', { timeZone: this.config.timezone ?? 'Asia/Shanghai' }));
      const h = shanghai.getHours();
      const m = shanghai.getMinutes();
      if (h === hour && m === minute) {
        const yesterday = new Date(shanghai);
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = formatDate(yesterday);
        if (this.lastFiredDate !== dateStr) {
          void this.fire(dateStr).then(() => { this.lastFiredDate = dateStr; });
        }
      }
      void this.backfill();
    }, 60_000);
  }

  private async backfill() {
    try {
      const now = new Date();
      const shanghai = new Date(now.toLocaleString('en-US', { timeZone: this.config.timezone ?? 'Asia/Shanghai' }));
      const scheduleParts = (this.config.scheduleTime ?? '12:00').split(':').map(Number);
      const schedHour = scheduleParts[0] ?? 12;
      const schedMin = scheduleParts[1] ?? 0;
      if (shanghai.getHours() < schedHour || (shanghai.getHours() === schedHour && shanghai.getMinutes() < schedMin)) {
        return;
      }
      const yesterday = new Date(shanghai);
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = formatDate(yesterday);
      if (this.lastFiredDate === dateStr) return;
      const existing = await this.repo.findByDate(dateStr);
      if (!existing) {
        await this.fire(dateStr);
        this.lastFiredDate = dateStr;
      }
    } catch {
      // backfill failure is non-fatal
    }
  }

  private async fire(reportDate: string) {
    try {
      await this.dailyReportService.generateDailyReport(reportDate, 'schedule');
    } catch {
      // logged by service
    }
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
