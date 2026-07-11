import { Routes } from '@angular/router';
import { authGuard, guestGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent),
    canActivate: [guestGuard]
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register').then(m => m.RegisterComponent),
    canActivate: [guestGuard]
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then(m => m.DashboardComponent)
      },
      {
        path: 'attendance',
        loadComponent: () => import('./features/attendance/attendance').then(m => m.AttendanceComponent)
      },
      {
        path: 'leaves',
        loadComponent: () => import('./features/leaves/leaves').then(m => m.LeavesComponent)
      },
      {
        path: 'summary',
        loadComponent: () => import('./features/summary/summary').then(m => m.SummaryComponent)
      },
      {
        path: 'admin',
        loadComponent: () => import('./features/admin/admin').then(m => m.AdminComponent),
        canActivate: [adminGuard]
      },
      {
        path: 'performance-metrics',
        loadComponent: () => import('./features/performance-metrics/performance-metrics').then(m => m.PerformanceMetricsComponent)
      },
      {
        path: 'food-request',
        loadComponent: () => import('./features/food-request/food-request').then(m => m.FoodRequestComponent)
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile').then(m => m.ProfileComponent)
      }

    ]
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
