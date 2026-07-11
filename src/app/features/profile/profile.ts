import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { database } from '../../core/firebase.config';
import { ref, set, push, onValue, off, update } from 'firebase/database';
import { CustomDialogService } from '../../core/services/custom-dialog.service';

export interface PersonalEvent {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss'
})
export class ProfileComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private dialogSvc = inject(CustomDialogService);

  // Profile data
  name = signal('');
  email = signal('');
  role = signal('');
  dob = signal('');
  createdAt = signal('');
  photoUrl = signal('');
  isUploadingPhoto = signal(false);

  // Personal Events state
  personalEvents = signal<PersonalEvent[]>([]);
  newEventDate = '';
  newEventTitle = '';
  newEventDesc = '';
  isSavingEvent = signal(false);
  eventMsg = signal('');

  private dbRef: any = null;

  ngOnInit() {
    const profile = this.auth.userProfile();
    if (profile) {
      this.name.set(profile.name);
      this.email.set(profile.email);
      this.role.set(profile.role);
      this.dob.set(profile.dob || '');
      this.createdAt.set(profile.createdAt || '');
      this.photoUrl.set(profile.photoUrl || '');
      
      this.listenToPersonalEvents(profile.uid);
    }
  }

  async onFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    this.isUploadingPhoto.set(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 256;
        const MAX_HEIGHT = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          alert('Could not process image.');
          this.isUploadingPhoto.set(false);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);

        const uid = this.auth.currentUser()?.uid;
        if (!uid) {
          this.isUploadingPhoto.set(false);
          return;
        }

        try {
          const userRef = ref(database, `users/${uid}`);
          await update(userRef, { photoUrl: compressedBase64 });
          this.photoUrl.set(compressedBase64);
          await this.auth.loadUserProfile(uid);
        } catch (err: any) {
          alert('Failed to save profile picture: ' + err.message);
        } finally {
          this.isUploadingPhoto.set(false);
        }
      };
      img.onerror = () => {
        alert('Failed to load image.');
        this.isUploadingPhoto.set(false);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      alert('Failed to read image file.');
      this.isUploadingPhoto.set(false);
    };
    reader.readAsDataURL(file);
  }

  ngOnDestroy() {
    this.stopListening();
  }

  private listenToPersonalEvents(uid: string) {
    this.dbRef = ref(database, `users/${uid}/personalEvents`);
    onValue(this.dbRef, (snap) => {
      if (!snap.exists()) {
        this.personalEvents.set([]);
      } else {
        const raw = snap.val() as Record<string, Omit<PersonalEvent, 'id'>>;
        const list: PersonalEvent[] = Object.entries(raw).map(([id, item]) => ({
          ...item,
          id
        }));
        // Sort by date ascending
        list.sort((a, b) => a.date.localeCompare(b.date));
        this.personalEvents.set(list);
      }
    });
  }

  private stopListening() {
    if (this.dbRef) {
      off(this.dbRef);
      this.dbRef = null;
    }
  }

  async addPersonalEvent() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;

    if (!this.newEventDate || !this.newEventTitle.trim()) {
      this.eventMsg.set('Please provide both event date and title.');
      return;
    }

    this.isSavingEvent.set(true);
    this.eventMsg.set('');

    try {
      const eventsRef = ref(database, `users/${uid}/personalEvents`);
      const newEventRef = push(eventsRef);
      const eventData: Omit<PersonalEvent, 'id'> = {
        title: this.newEventTitle.trim(),
        description: this.newEventDesc.trim(),
        date: this.newEventDate
      };

      await set(newEventRef, eventData);
      
      this.eventMsg.set('✅ Personal event added successfully!');
      this.newEventDate = '';
      this.newEventTitle = '';
      this.newEventDesc = '';
      setTimeout(() => this.eventMsg.set(''), 3000);
    } catch (e: any) {
      this.eventMsg.set('❌ Error: ' + e.message);
    } finally {
      this.isSavingEvent.set(false);
    }
  }

  async deleteEvent(eventId: string, title: string) {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;

    const isConfirmed = await this.dialogSvc.confirm('Delete Event', `Are you sure you want to delete the event "${title}"?`);
    if (!isConfirmed) return;

    try {
      const eventPath = ref(database, `users/${uid}/personalEvents/${eventId}`);
      await set(eventPath, null);
    } catch (e: any) {
      alert('Failed to delete event: ' + e.message);
    }
  }

  get initials(): string {
    const nameVal = this.name() || 'U';
    return nameVal.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }
}
