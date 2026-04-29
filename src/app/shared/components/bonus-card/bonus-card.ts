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
  // New tiered bonus fields
  halfBonusThreshold: number;
  fullBonusThreshold: number;
  halfBonusEligible: boolean;
  fullBonusEligible: boolean;
  daysUntilHalfBonus: number;
  daysUntilFullBonus: number;
  currentBonus: 'none' | 'half' | 'full';
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

  get bonusStatusText(): string {
    if (!this.data) return 'No Bonus';
    if (this.data.currentBonus === 'full') return '🏆 Full Bonus';
    if (this.data.currentBonus === 'half') return '🎁 Half Bonus';
    return '❌ Not Yet Eligible';
  }

  get bonusStatusClass(): string {
    if (!this.data) return 'status-none';
    if (this.data.currentBonus === 'full') return 'status-full';
    if (this.data.currentBonus === 'half') return 'status-half';
    return 'status-none';
  }
}
