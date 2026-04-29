import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CelebrationService {
  isCelebrating = signal(false);
  celebrationType = signal<'half' | 'full' | null>(null);

  showCelebration(type: 'half' | 'full') {
    if (this.isCelebrating()) return;

    this.celebrationType.set(type);
    this.isCelebrating.set(true);

    // Create the overlay elements
    this.createCelebrationElements(type);

    // Auto cleanup after 10 seconds
    setTimeout(() => {
      this.isCelebrating.set(false);
      this.celebrationType.set(null);
      this.removeCelebrationElements();
    }, 10000);
  }

  private createCelebrationElements(type: 'half' | 'full') {
    const container = document.createElement('div');
    container.id = 'celebration-overlay';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '9999';
    container.style.overflow = 'hidden';
    document.body.appendChild(container);

    // Add Message
    const msg = document.createElement('div');
    msg.className = 'celebration-message';
    msg.innerHTML = type === 'half' 
      ? '<h1>🎉 Congratulations! 🎉</h1><p>You are eligible for one basic salary bonus!</p>'
      : '<h1>🎊 AMAZING! 🎊</h1><p>You have get double bonus because you have completed 240 days!</p>';
    
    msg.style.position = 'absolute';
    msg.style.top = '50%';
    msg.style.left = '50%';
    msg.style.transform = 'translate(-50%, -50%)';
    msg.style.textAlign = 'center';
    msg.style.color = 'white';
    msg.style.textShadow = '0 4px 10px rgba(0,0,0,0.5)';
    msg.style.background = 'rgba(0,0,0,0.7)';
    msg.style.padding = '2rem';
    msg.style.borderRadius = '20px';
    msg.style.backdropFilter = 'blur(10px)';
    msg.style.border = '2px solid gold';
    msg.style.animation = 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    msg.style.pointerEvents = 'auto';
    container.appendChild(msg);

    // Add Close Button
    const closeBtn = document.createElement('button');
    closeBtn.innerText = 'Close';
    closeBtn.style.marginTop = '1rem';
    closeBtn.style.padding = '8px 20px';
    closeBtn.style.borderRadius = '10px';
    closeBtn.style.border = 'none';
    closeBtn.style.background = 'gold';
    closeBtn.style.color = '#000';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => this.removeCelebrationElements();
    msg.appendChild(closeBtn);

    // Add Balloons
    for (let i = 0; i < 20; i++) {
      this.createBalloon(container);
    }

    // Add Firecrackers for full bonus
    if (type === 'full') {
      for (let i = 0; i < 10; i++) {
        setTimeout(() => this.createFirecracker(container), i * 500);
      }
    }

    // Add CSS Animations if not present
    if (!document.getElementById('celebration-styles')) {
      const style = document.createElement('style');
      style.id = 'celebration-styles';
      style.innerHTML = `
        @keyframes popIn {
          from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        @keyframes floatUp {
          from { transform: translateY(100vh) rotate(0deg); }
          to { transform: translateY(-120vh) rotate(20deg); }
        }
        @keyframes burst {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        .balloon {
          position: absolute;
          width: 60px;
          height: 80px;
          border-radius: 50% 50% 50% 50% / 40% 40% 60% 60%;
          animation: floatUp 6s linear infinite;
        }
        .balloon::after {
          content: "";
          position: absolute;
          bottom: -10px;
          left: 50%;
          width: 2px;
          height: 30px;
          background: rgba(255,255,255,0.5);
          transform: translateX(-50%);
        }
        .firecracker {
          position: absolute;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: gold;
          animation: burst 1s ease-out forwards;
        }
      `;
      document.head.appendChild(style);
    }
  }

  private createBalloon(container: HTMLElement) {
    const b = document.createElement('div');
    b.className = 'balloon';
    const colors = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c'];
    b.style.background = colors[Math.floor(Math.random() * colors.length)];
    b.style.left = Math.random() * 90 + 'vw';
    b.style.bottom = '-100px';
    b.style.animationDuration = (Math.random() * 4 + 4) + 's';
    b.style.animationDelay = Math.random() * 5 + 's';
    b.style.opacity = '0.8';
    container.appendChild(b);
  }

  private createFirecracker(container: HTMLElement) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    
    for (let i = 0; i < 30; i++) {
      const f = document.createElement('div');
      f.className = 'firecracker';
      f.style.left = x + 'vw';
      f.style.top = y + 'vh';
      const angle = (i / 30) * Math.PI * 2;
      const velocity = Math.random() * 100 + 50;
      const tx = Math.cos(angle) * velocity;
      const ty = Math.sin(angle) * velocity;
      
      f.style.setProperty('--tx', tx + 'px');
      f.style.setProperty('--ty', ty + 'px');
      f.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.5)`, opacity: 0 }
      ], {
        duration: 1000,
        easing: 'ease-out'
      });
      container.appendChild(f);
      setTimeout(() => f.remove(), 1000);
    }
  }

  private removeCelebrationElements() {
    const container = document.getElementById('celebration-overlay');
    if (container) {
      container.style.transition = 'opacity 0.5s';
      container.style.opacity = '0';
      setTimeout(() => container.remove(), 500);
    }
    this.isCelebrating.set(false);
  }
}
