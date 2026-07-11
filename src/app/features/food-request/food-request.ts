import { Component, inject, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { AttendanceService } from '../../core/services/attendance.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-food-request',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './food-request.html',
  styleUrl: './food-request.scss'
})
export class FoodRequestComponent implements OnInit, OnDestroy {
  private attendanceSvc = inject(AttendanceService);
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  // Form Fields
  name = '';
  division = 'Transport Office';
  lunchCategory = '';
  isOrderForFriend = false;
  friendName = '';

  // Clock variables
  currentTimeStr = signal('');
  currentDateStr = signal('');
  private clockInterval: any;

  friends = [
    'Janith Gunawardana',
    'Hirun Prabodhya',
    'Udesh Wickramanayake ',
    'Thilina welideniya',
    'Helitha Winsuka',
    'Hiruni Kuashalaya',
    'Pradeep Suranga'
  ];


  // States
  isLoading = signal(false);
  successMsg = signal('');
  errorMsg = signal('');
  foodRequests = signal<any[]>([]);
  filteredFoodRequests = computed(() => {
    const profile = this.auth.userProfile();
    const userName = profile?.name ? profile.name.trim().toLowerCase() : '';
    return this.foodRequests().filter((req: any) => 
      req.name && req.name.trim().toLowerCase() === userName
    );
  });

  // Division Options
  divisions = [
    'Export Office',
    'Innovex Office',
    'Transport Office',
    'IT',
    'Customer Care'
  ];

  // Lunch Category Options
  categories = [
    'Rice with Chicken (Rs. 230)',
    'Rice with Fish ( Rs.160 )',
    'Rice with Egg (Rs. 150 )',
    'Rice with Vegetable ( Rs. 110)',
    'Curry - Fish ( Rs. 60 )',
    'Curry - Egg ( Rs. 60)',
    'Curry- Chicken (Rs. 120)'
  ];


  ngOnInit() {
    // Prefill name from authenticated user profile if available
    const user = this.auth.userProfile();
    if (user?.name) {
      this.name = user.name;
    }
    this.loadFoodRequests();

    // Start Live Clock
    this.updateClock();
    this.clockInterval = setInterval(() => {
      this.updateClock();
    }, 1000);
  }

  ngOnDestroy() {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
  }

  updateClock() {
    const now = new Date();
    this.currentTimeStr.set(now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }));
    this.currentDateStr.set(now.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }));
  }

  getColomboDate(): Date {
    const colomboTimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" });
    return new Date(colomboTimeStr);
  }

  // Returns true if current time is within 6:00 AM – 9:00 AM ordering window
  isOrderingOpen(): boolean {
    const now = this.getColomboDate();
    const h = now.getHours();
    return h >= 6 && h < 9;
  }

  // Warning fires at 8:55 AM — last 5 minutes of the window
  isCutoffApproaching(): boolean {
    const now = this.getColomboDate();
    const h = now.getHours();
    const m = now.getMinutes();
    return h === 8 && m >= 55;
  }

  // Cutoff passed = outside the 6–9 AM window
  isCutoffPassed(): boolean {
    return !this.isOrderingOpen();
  }

  // Human-readable status label for the clock widget
  get orderingWindowLabel(): string {
    const now = this.getColomboDate();
    const h = now.getHours();
    if (h < 6) return 'Opens at 6:00 AM';
    if (h >= 9) return 'Closed — Reopens Tomorrow at 6 AM';
    return 'Open';
  }

  loadFoodRequests() {
    this.attendanceSvc.getFoodRequests().subscribe({
      next: (data) => {
        this.foodRequests.set(data);
      },
      error: (err) => {
        console.error('Failed to load food requests:', err);
      }
    });
  }

  onFriendToggle() {
    if (!this.isOrderForFriend) {
      this.friendName = '';
      const user = this.auth.userProfile();
      this.name = user?.name || '';
    } else {
      this.name = '';
    }
  }

  get lastOrder(): any {
    const requests = this.filteredFoodRequests();
    return requests.length > 0 ? requests[0] : null;
  }

  repeatOrder(req: any) {
    if (!req) return;

    const reqNameTrimmed = req.name.trim();
    // Find matching friend by trimming both
    const matchedFriend = this.friends.find(f => f.trim() === reqNameTrimmed);

    if (matchedFriend) {
      this.isOrderForFriend = true;
      this.friendName = matchedFriend;
      this.name = '';
    } else {
      this.isOrderForFriend = false;
      this.friendName = '';
      this.name = req.name;
    }

    this.division = 'Transport Office';
    this.lunchCategory = req.lunchCategory || '';

    // Scroll to the form smoothly
    const formElement = document.querySelector('.form-section');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    this.successMsg.set(`Form pre-filled with order details for: ${req.name}`);
    setTimeout(() => {
      if (this.successMsg() === `Form pre-filled with order details for: ${req.name}`) {
        this.successMsg.set('');
      }
    }, 4000);
  }

  onSubmit() {
    const finalName = this.isOrderForFriend ? this.friendName : this.name.trim();
    if (!finalName || !this.division || !this.lunchCategory) {
      this.errorMsg.set('Please fill in all required fields.');
      this.successMsg.set('');
      return;
    }

    this.isLoading.set(true);
    this.errorMsg.set('');
    this.successMsg.set('');

    const payload = {
      name: finalName,
      division: this.division,
      lunchCategory: this.lunchCategory
    };

    // Action A: Local Database Save via Internal API
    this.attendanceSvc.saveFoodRequest(payload).subscribe({
      next: (newRequest) => {
        this.successMsg.set('Food request logged successfully in the system database Automatically Submitted to the Office Form .');
        this.loadFoodRequests();
        this.isLoading.set(false);
        
        // Suppress lunch alert for today if this order was for the logged in user themselves
        const currentUser = this.auth.currentUser();
        const profile = this.auth.userProfile();
        if (currentUser && profile && payload.name.trim().toLowerCase() === profile.name.trim().toLowerCase()) {
          const todayStr = new Date().toISOString().split('T')[0];
          localStorage.setItem(`lunch_ordered_${currentUser.uid}`, todayStr);
        }

        // Reset selections for the next submission
        this.division = 'Transport Office';
        this.lunchCategory = '';
      },
      error: (err) => {
        this.errorMsg.set('Failed to save food request to local database.');
        this.isLoading.set(false);
      }
    });

    // Action B: Open pre-filled Google Form in a new tab (Required to capture employee Workspace email address & bypass SameSite restrictions)
    try {
      const baseUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdoPrpw7Ybg5jujOEtAqcTCyTU2z7VRBdxeWoi6BTwLbnm7dg/viewform';
      const prefilledUrl = `${baseUrl}?entry.1711473520=${encodeURIComponent(payload.name)}&entry.1809901273=${encodeURIComponent(payload.division)}&entry.1524728558=${encodeURIComponent(payload.lunchCategory)}`;
      
      console.log('Opening pre-filled Google Form in a new tab:', prefilledUrl);
      window.open(prefilledUrl, '_blank');
    } catch (e: any) {
      console.error('Failed to open pre-filled Google Form:', e);
    }

  }
}
