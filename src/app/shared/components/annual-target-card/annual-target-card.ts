import { Component, Input, OnInit, OnChanges, SimpleChanges, inject, signal, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnnualProjectionService, AnnualProjectionResult } from '../../../core/services/annual-projection.service';
import { HolidayService } from '../../../core/services/holiday.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-annual-target-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './annual-target-card.html',
  styleUrl: './annual-target-card.scss'
})
export class AnnualTargetCardComponent implements OnInit, OnChanges {
  private projectionSvc = inject(AnnualProjectionService);
  private holidaySvc = inject(HolidayService);
  private auth = inject(AuthService);

  @Input() uid?: string;
  @Input() targetDays: number = 240;
  @Input() showBreakdown: boolean = true;

  data = signal<AnnualProjectionResult | null>(null);
  isLoading = signal(true);
  isExpanded = signal(false);

  constructor() {
    // Automatically recalculate projection whenever holidays in the system change
    effect(() => {
      this.holidaySvc.holidays(); // Register reactive dependency
      untracked(() => {
        setTimeout(() => this.loadProjection(), 0);
      });
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.loadProjection();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['uid']) {
      this.loadProjection();
    }
  }

  async loadProjection(): Promise<void> {
    const targetUid = this.uid || this.auth.currentUser()?.uid;
    if (!targetUid) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    try {
      const res = await this.projectionSvc.calculateAnnualProjection(targetUid, this.targetDays);
      this.data.set(res);
    } catch (err) {
      console.error('Failed to calculate annual projection:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleDetails(): void {
    this.isExpanded.update(v => !v);
  }

  formatDate(isoStr?: string): string {
    if (!isoStr) return '—';
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      return `${parts[0]}/${parts[1]}/${parts[2]}`;
    }
    return isoStr;
  }
}
