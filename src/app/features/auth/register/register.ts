import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink, CommonModule],
  templateUrl: './register.html',
  styleUrl: './register.scss'
})
export class RegisterComponent {
  private auth = inject(AuthService);

  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  isLoading = signal(false);
  errorMsg = signal('');
  successMsg = signal('');

  async onSubmit() {
    if (!this.name || !this.email || !this.password) {
      this.errorMsg.set('Please fill in all fields.');
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.errorMsg.set('Passwords do not match.');
      return;
    }
    if (this.password.length < 6) {
      this.errorMsg.set('Password must be at least 6 characters.');
      return;
    }
    this.isLoading.set(true);
    this.errorMsg.set('');
    try {
      await this.auth.register(this.email, this.password, this.name);
    } catch (e: any) {
      const msg = e?.code === 'auth/email-already-in-use'
        ? 'This email is already registered.'
        : e?.message ?? 'Registration failed.';
      this.errorMsg.set(msg);
    } finally {
      this.isLoading.set(false);
    }
  }
}
