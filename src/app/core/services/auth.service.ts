import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import { ref, set, get, update } from 'firebase/database';
import { auth, database } from '../firebase.config';
import { UserProfile } from '../models/user.model';
import { FcmService } from './fcm.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private fcmService = inject(FcmService);

  currentUser = signal<User | null>(null);
  userProfile = signal<UserProfile | null>(null);
  isLoading = signal(true);

  constructor() {
    onAuthStateChanged(auth, async (user) => {
      this.currentUser.set(user);
      if (user) {
        await this.loadUserProfile(user.uid);
        this.fcmService.requestPermissionAndGetToken(user.uid);
      } else {
        this.userProfile.set(null);
      }
      this.isLoading.set(false);
    });
  }

  async login(email: string, password: string): Promise<void> {
    let cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    // TEMPORARY ALIAS SPOOFING: Allow login using the new emails before migration completes
    let originalAttemptEmail = cleanEmail;
    if (cleanEmail === 'udeshinnovex@gmail.com') {
      cleanEmail = 'udesh@gmail.com';
    } else if (cleanEmail === 'mihiranga.office@gmail.com') {
      cleanEmail = 'mihiranga.officesl@gmail.com';
    }

    // Hardcoded Master Logins (DA/DA or admin/admin)
    if ((cleanEmail === 'da' && cleanPassword === 'DA') || (cleanEmail === 'admin' && cleanPassword === 'admin')) {
      console.log('Hardcoded master login detected!');
      const { signInAnonymously } = await import('firebase/auth');
      const cred = await signInAnonymously(auth);
      
      const adminProfile: UserProfile = {
        uid: cred.user.uid,
        name: 'System Administrator',
        email: cleanEmail === 'admin' ? 'admin@damro.local' : 'da@damro.local',
        role: 'admin',
        createdAt: new Date().toISOString()
      };

      await set(ref(database, `users/${cred.user.uid}`), adminProfile);
      this.userProfile.set(adminProfile);

      // Clean up any existing admin accounts to prevent duplicates
      // (Runs after setting current profile so database rules permit reading/writing /users)
      try {
        const usersSnap = await get(ref(database, 'users'));
        if (usersSnap.exists()) {
          const usersObj = usersSnap.val();
          const updates: Record<string, null> = {};
          for (const uid in usersObj) {
            const user = usersObj[uid];
            if (
              user &&
              user.role === 'admin' &&
              (user.email === 'admin@damro.local' || user.email === 'da@damro.local') &&
              uid !== cred.user.uid
            ) {
              updates[`users/${uid}`] = null;
            }
          }
          if (Object.keys(updates).length > 0) {
            await update(ref(database), updates);
            console.log('Cleaned up duplicate admin accounts during login:', Object.keys(updates));
          }
        }
      } catch (err) {
        console.error('Failed to clean up old admin accounts during login:', err);
      }

      this.router.navigate(['/admin']);
      return;
    }

    const cred = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
    
    // --- ONE-TIME FIREBASE SIDE EMAIL MIGRATION ---
    if (cleanEmail === 'udesh@gmail.com' && originalAttemptEmail === 'udeshinnovex@gmail.com') {
      try {
        const { verifyBeforeUpdateEmail } = await import('firebase/auth');
        await verifyBeforeUpdateEmail(cred.user, 'udeshinnovex@gmail.com');
        await update(ref(database, `users/${cred.user.uid}`), { email: 'udeshinnovex@gmail.com' });
        console.log('Verification email sent to udeshinnovex@gmail.com');
      } catch (err) {
        console.error('Firebase Auth Migration failed for Udesh', err);
      }
    } else if (cleanEmail === 'mihiranga.officesl@gmail.com' && originalAttemptEmail === 'mihiranga.office@gmail.com') {
      try {
        const { verifyBeforeUpdateEmail } = await import('firebase/auth');
        await verifyBeforeUpdateEmail(cred.user, 'mihiranga.office@gmail.com');
        await update(ref(database, `users/${cred.user.uid}`), { email: 'mihiranga.office@gmail.com' });
        console.log('Verification email sent to mihiranga.office@gmail.com');
      } catch (err) {
        console.error('Firebase Auth Migration failed for Mihiranga', err);
      }
    }
    // ----------------------------------------------

    await this.loadUserProfile(cred.user.uid);
    const profile = this.userProfile();
    
    // Check role and redirect accordingly
    if (profile?.role === 'admin') {
      this.router.navigate(['/admin']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  async register(email: string, password: string, name: string, role: 'admin' | 'employee' = 'employee'): Promise<void> {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const profile: UserProfile = {
      uid: cred.user.uid,
      name,
      email,
      role,
      createdAt: new Date().toISOString()
    };
    await set(ref(database, `users/${cred.user.uid}`), profile);
    this.userProfile.set(profile);
    
    if (role === 'admin') {
      this.router.navigate(['/admin']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  isLoggingOut = false;

  async logout(): Promise<void> {
    this.isLoggingOut = true;
    const user = this.currentUser();
    if (user) {
      try {
        const userRef = ref(database, `users/${user.uid}`);
        await update(userRef, { fcmToken: null });
        console.log('FCM Token cleared during logout.');
      } catch (error) {
        console.error('Failed to clear FCM token during logout:', error);
      }
    }
    await signOut(auth);
    this.userProfile.set(null);
    this.isLoggingOut = false;
    this.router.navigate(['/login']);
  }

  async loadUserProfile(uid: string): Promise<void> {
    const snap = await get(ref(database, `users/${uid}`));
    if (snap.exists()) {
      this.userProfile.set(snap.val() as UserProfile);
    }
  }

  isAdmin(): boolean {
    return this.userProfile()?.role === 'admin';
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.currentUser();
    if (!user || !user.email) throw new Error('Not authenticated');
    const cred = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newPassword);
  }
}
