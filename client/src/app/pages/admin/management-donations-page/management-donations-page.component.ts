import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdminSidebarComponent } from '@app/components/admin/admin-sidebar/admin-sidebar.component';
import { LoadingSpinnerComponent } from '@app/components/loading-spinner/loading-spinner.component';
import { AdminCommunicationService } from '@app/services/communication/admin/admin.communication.service';
import { NotificationService } from '@app/services/notification/notification.service';
import { BaseDestroyableComponent } from '@app/shared/base-destroyable.component';
import { PaymentStatus } from '@common/enums/payment-status';
import { Donation } from '@common/interfaces/donation';
import { takeUntil } from 'rxjs/operators';

@Component({
    selector: 'app-management-donations-page',
    standalone: true,
    imports: [CommonModule, AdminSidebarComponent, LoadingSpinnerComponent],
    templateUrl: './management-donations-page.component.html',
    styleUrl: './management-donations-page.component.scss',
})
export class ManagementDonationsPageComponent extends BaseDestroyableComponent implements OnInit {
    donations: Donation[] = [];
    PaymentStatus = PaymentStatus;
    isLoading = false;

    constructor(
        private adminService: AdminCommunicationService,
        private router: Router,
        private notificationService: NotificationService,
        private cdr: ChangeDetectorRef,
    ) {
        super();
    }

    ngOnInit(): void {
        this.loadDonations();
    }

    loadDonations(): void {
        this.isLoading = true;
        this.adminService.getAllDonations()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (data) => {
                    this.donations = data;
                    this.isLoading = false;
                    this.cdr.detectChanges();
                },
                error: () => {
                    this.isLoading = false;
                    this.cdr.detectChanges();
                    this.notificationService.error('Erreur lors du chargement des dons.');
                },
            });
    }

    goToDonation(id: string): void {
        this.router.navigate(['/admin/don', id]);
    }
}
