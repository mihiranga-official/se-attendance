import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CustomDialogService {
  show = signal(false);
  title = signal('');
  message = signal('');
  private resolveFn?: (value: boolean) => void;

  confirm(title: string, message: string): Promise<boolean> {
    this.title.set(title);
    this.message.set(message);
    this.show.set(true);
    return new Promise(resolve => {
      this.resolveFn = resolve;
    });
  }

  submit(result: boolean) {
    this.show.set(false);
    if (this.resolveFn) {
      this.resolveFn(result);
      this.resolveFn = undefined;
    }
  }
}
