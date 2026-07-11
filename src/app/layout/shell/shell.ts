import { Component, inject, signal, OnInit, OnDestroy, effect, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { InactivityService } from '../../core/services/inactivity.service';
import { ThemeService } from '../../core/services/theme.service';
import { LunchAlertService } from '../../core/services/lunch-alert.service';
import { CustomDialogService } from '../../core/services/custom-dialog.service';
import { NotificationService } from '../../core/services/notification.service';
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
  notificationSvc = inject(NotificationService);
  private router = inject(Router);
  
  sidebarOpen = signal(false);
  dropdownOpen = signal(false);
  notificationsOpen = signal(false);

  notifications = this.notificationSvc.notifications;
  unreadCount = computed(() => this.notifications().filter(n => !n.read).length);

  constructor() {
    effect(() => {
      const profile = this.auth.userProfile();
      if (profile) {
        this.notificationSvc.listenToNotifications(profile.uid);
      } else {
        this.notificationSvc.stopListening();
      }
    });
  }

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

  toggleNotifications() {
    this.notificationsOpen.update(v => !v);
    if (this.notificationsOpen()) {
      this.closeDropdown();
    }
  }

  closeNotifications() {
    this.notificationsOpen.set(false);
  }

  async markAsRead(id: string) {
    const uid = this.auth.currentUser()?.uid;
    if (uid) {
      await this.notificationSvc.markAsRead(uid, id);
    }
  }

  async markAllAsRead() {
    const uid = this.auth.currentUser()?.uid;
    if (uid) {
      await this.notificationSvc.markAllAsRead(uid);
    }
  }

  async clearNotification(id: string, event: Event) {
    event.stopPropagation();
    const uid = this.auth.currentUser()?.uid;
    if (uid) {
      await this.notificationSvc.clearNotification(uid, id);
    }
  }

  async clearAllNotifications() {
    const isConfirmed = await this.dialogService.confirm('Clear Notifications', 'Are you sure you want to clear all your notifications?');
    if (!isConfirmed) return;
    
    const uid = this.auth.currentUser()?.uid;
    if (uid) {
      await this.notificationSvc.clearAll(uid);
    }
  }

  getRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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
