import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { InactivityService } from '../../core/services/inactivity.service';
import { ThemeService } from '../../core/services/theme.service';
import { LunchAlertService } from '../../core/services/lunch-alert.service';
import { CustomDialogService } from '../../core/services/custom-dialog.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './shell.html',
  styleUrl: './shell.scss'
})
export class ShellComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  inactivity = inject(InactivityService);
  theme = inject(ThemeService);
  lunchAlert = inject(LunchAlertService);
  dialogService = inject(CustomDialogService);
  private router = inject(Router);
  
  sidebarOpen = signal(false);
  dropdownOpen = signal(false);

  // Monetized Ads List
  ads = [
    {
      title: 'DAMRO CANTEEN DISCOUNT',
      description: 'Get 10% off afternoon tea & rolls! Pre-order on portal now.',
      cta: 'Pre-order Tea',
      link: '/food-request',
      image: '🥪',
      color: '#10b981' // Canteen Emerald
    },
    {
      title: 'GITHUB COPILOT PREVIEW',
      description: 'Boost team development velocity by 55% using AI code completion.',
      cta: 'Try Copilot',
      link: 'https://github.com/features/copilot',
      image: '🤖',
      color: '#6366f1' // AI Indigo
    },
    {
      title: 'AWS DEV CLOUD WIDGET',
      description: 'Deploy serverless backend apps on AWS. Claim $100 developer credits.',
      cta: 'Get AWS Credits',
      link: 'https://aws.amazon.com',
      image: '☁️',
      color: '#f97316' // Cloud Orange
    }
  ];
  currentAdIndex = signal(0);
  private adInterval: any;

  ngOnInit() {
    this.inactivity.startTracking();
    this.lunchAlert.startTracking();

    // Start cycling ads every 10 seconds
    this.adInterval = setInterval(() => {
      this.currentAdIndex.update(idx => (idx + 1) % this.ads.length);
    }, 10000);
  }

  ngOnDestroy() {
    if (this.adInterval) {
      clearInterval(this.adInterval);
    }
  }

  onAdClick(ad: any, event: Event) {
    if (ad.link.startsWith('/')) {
      event.preventDefault();
      this.router.navigate([ad.link]);
      this.closeSidebar();
    }
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar() {
    this.sidebarOpen.set(false);
  }
  
  toggleDropdown() {
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown() {
    this.dropdownOpen.set(false);
  }

  async logout() {
    this.inactivity.stopTracking();
    this.lunchAlert.stopTracking();
    if (this.adInterval) {
      clearInterval(this.adInterval);
    }
    await this.auth.logout();
  }

  get initials(): string {
    const name = this.auth.userProfile()?.name ?? 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }
}
