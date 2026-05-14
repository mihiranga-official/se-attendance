import { Injectable, inject } from '@angular/core';
import { SummaryService } from './summary.service';
import { MonthlySummary } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class PerformanceService {
  private summarySvc = inject(SummaryService);

  async getPerformanceData(uid: string, year: number, month: number) {
    return this.summarySvc.getMonthlySummary(uid, year, month);
  }

  async getYearlyTrend(uid: string, year: number) {
    return this.summarySvc.getPerformanceTrend(uid, year);
  }
}
