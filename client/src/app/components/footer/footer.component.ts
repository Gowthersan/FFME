import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-footer',
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule],
    templateUrl: './footer.component.html',
    styleUrl: './footer.component.scss',
})
export class FooterComponent {
    currentYear = new Date().getFullYear();
    newsletterEmail = '';
    newsletterStatus = '';
    newsletterSuccess = false;
    isSubmitting = false;

    subscribeNewsletter(): void {
        if (!this.newsletterEmail || !this.isValidEmail(this.newsletterEmail)) {
            this.newsletterStatus = 'Veuillez entrer un email valide';
            this.newsletterSuccess = false;
            return;
        }

        this.isSubmitting = true;
        this.newsletterStatus = '';

        // Simulation d'envoi - à remplacer par un vrai appel API
        setTimeout(() => {
            this.newsletterStatus = 'Merci pour votre inscription !';
            this.newsletterSuccess = true;
            this.newsletterEmail = '';
            this.isSubmitting = false;

            // Effacer le message après 5 secondes
            setTimeout(() => {
                this.newsletterStatus = '';
            }, 5000);
        }, 1000);
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}
