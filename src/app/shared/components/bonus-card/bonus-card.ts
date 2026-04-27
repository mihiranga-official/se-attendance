import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface BonusProgress {
  presentDays: number;
  requiredDays: number;
  pendingDays: number;
  isEligible: boolean;
  startDate: Date;
  endDate: Date;
  percentage: number;
}

@Component({
  selector: 'app-bonus-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bonus-card.html',
  styleUrl: './bonus-card.scss'
})
export class BonusCardComponent {
  @Input() data: BonusProgress | null = null;
  @Input() loading = false;

  get periodTooltip(): string {
    if (!this.data) return '';
    const start = this.data.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const end = this.data.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `Period: ${start} - ${end}`;
  }
}
