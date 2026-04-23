import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  private auth = inject(AuthService);

  email = '';
  password = '';
  showPassword = false;
  isLoading = signal(false);
  errorMsg = signal('');

  async onSubmit() {
    if (!this.email || !this.password) {
      this.errorMsg.set('Please fill in all fields.');
      return;
    }
    this.isLoading.set(true);
    this.errorMsg.set('');
    try {
      await this.auth.login(this.email, this.password);
    } catch (e: any) {
      const msg = e?.code === 'auth/invalid-credential'
        ? 'Invalid email or password.'
        : e?.message ?? 'Login failed.';
      this.errorMsg.set(msg);
    } finally {
      this.isLoading.set(false);
    }
  }
}
