import { Injectable } from '@angular/core';
import { ref, get, set, update, remove } from 'firebase/database';
import { database } from '../firebase.config';
import { UserProfile } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class UserService {

  async getAllUsers(): Promise<UserProfile[]> {
    const snap = await get(ref(database, 'users'));
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, UserProfile>);
  }

  async getUserById(uid: string): Promise<UserProfile | null> {
    const snap = await get(ref(database, `users/${uid}`));
    return snap.exists() ? snap.val() : null;
  }

  async updateUser(uid: string, changes: Partial<UserProfile>): Promise<void> {
    await update(ref(database, `users/${uid}`), changes);
  }

  async deleteUser(uid: string): Promise<void> {
    await set(ref(database, `users/${uid}`), null);
  }

  async createUserProfile(profile: UserProfile): Promise<void> {
    await set(ref(database, `users/${profile.uid}`), profile);
  }
}
