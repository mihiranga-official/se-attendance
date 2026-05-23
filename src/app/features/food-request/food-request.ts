import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
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
    'Thilina',
    'Helitha'
  ];


  // States
  isLoading = signal(false);
  successMsg = signal('');
  errorMsg = signal('');
  foodRequests = signal<any[]>([]);

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

  isCutoffApproaching(): boolean {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    return hours === 8 && minutes >= 55;
  }

  isCutoffPassed(): boolean {
    const now = new Date();
    const hours = now.getHours();
    // Cutoff is passed if it's after 9:00 AM today OR before 6:00 AM (carrying over from the previous day's cutoff)
    return hours >= 9 || hours < 6;
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
    const userName = this.auth.userProfile()?.name;
    if (!userName) return null;
    const trimmedUser = userName.trim();

    const requests = this.foodRequests();
    // Search from index 0 since list is sorted newest first
    for (let i = 0; i < requests.length; i++) {
      if (requests[i].name && requests[i].name.trim() === trimmedUser) {
        return requests[i];
      }
    }
    return null;
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

    // Action B: Silent Google Form Background Automation (Using sendBeacon to avoid CORS console errors)
    try {
      const url = 'https://docs.google.com/forms/d/e/1FAIpQLSf6ELdbterMXih_uxZc-vzbE4PQYYztYZDYHtwEMxgmBUUWqw/formResponse';
      const params = new URLSearchParams();
      params.append('entry.1591631580', payload.name);
      params.append('entry.373083700', payload.division);
      params.append('entry.248001686', payload.lunchCategory);
      params.append('fvv', '1');
      params.append('pageHistory', '0');
      params.append('fbzx', '-2564804819205674787');

      const blob = new Blob([params.toString()], { type: 'application/x-www-form-urlencoded' });
      const sent = navigator.sendBeacon(url, blob);
      if (sent) {
        console.log('Background Google Form submission dispatched silently via sendBeacon.');
      } else {
        console.warn('sendBeacon failed to queue request, falling back to fetch in no-cors mode.');
        fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        }).catch(err => console.error('Silent fetch fallback failed:', err));
      }
    } catch (e: any) {
      console.error('Silent Google Form submission error:', e);
    }

  }
}
