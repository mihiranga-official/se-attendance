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

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);

  currentUser = signal<User | null>(null);
  userProfile = signal<UserProfile | null>(null);
  isLoading = signal(true);

  constructor() {
    onAuthStateChanged(auth, async (user) => {
      this.currentUser.set(user);
      if (user) {
        await this.loadUserProfile(user.uid);
      } else {
        this.userProfile.set(null);
      }
      this.isLoading.set(false);
    });
  }

  async login(email: string, password: string): Promise<void> {
    // Hardcoded Admin Login
    if (email === 'admin' && password === 'admin') {
      const mockProfile: UserProfile = {
        uid: 'admin_fixed',
        name: 'Damro Admin',
        email: 'admin@damro.com',
        role: 'admin',
        createdAt: new Date().toISOString()
      };
      this.userProfile.set(mockProfile);
      this.currentUser.set({ uid: 'admin_fixed', email: 'admin@damro.com' } as any);
      this.router.navigate(['/admin']);
      return;
    }

    const cred = await signInWithEmailAndPassword(auth, email, password);
    await this.loadUserProfile(cred.user.uid);
    const profile = this.userProfile();
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
    this.router.navigate(['/dashboard']);
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
