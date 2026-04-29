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
import { ref, set, get } from 'firebase/database';
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
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    // console.log('Login attempt:', { cleanEmail, cleanPassword });

    // Hardcoded Master Logins (DA/DA or admin/admin)
    if ((cleanEmail === 'DA' && cleanPassword === 'DA') || (cleanEmail === 'admin' && cleanPassword === 'admin')) {
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
      this.router.navigate(['/admin']);
      return;
    }

    const cred = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
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

  async logout(): Promise<void> {
    await signOut(auth);
    this.userProfile.set(null);
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
