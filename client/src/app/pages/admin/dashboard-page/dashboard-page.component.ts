import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdminSidebarComponent } from '@app/components/admin/admin-sidebar/admin-sidebar.component';
import { LoadingSpinnerComponent } from '@app/components/loading-spinner/loading-spinner.component';
import { AdminCommunicationService } from '@app/services/communication/admin/admin.communication.service';
import { NotificationService } from '@app/services/notification/notification.service';
import { BaseDestroyableComponent } from '@app/shared/base-destroyable.component';
import { DashboardStats } from '@common/interfaces/dashboard-stats';
import { takeUntil } from 'rxjs/operators';

@Component({
    selector: 'app-dashboard-page',
    standalone: true,
    imports: [AdminSidebarComponent, CommonModule, LoadingSpinnerComponent],
    templateUrl: './dashboard-page.component.html',
    styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent extends BaseDestroyableComponent implements OnInit {
    stats: DashboardStats | null = null;
    isLoading = false;

    constructor(
        private router: Router,
        private adminService: AdminCommunicationService,
        private notificationService: NotificationService,
        private cdr: ChangeDetectorRef,
    ) {
        super();
    }

    ngOnInit(): void {
        this.loadStats();
    }

    loadStats(): void {
        this.isLoading = true;
        this.adminService.getStats()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (stats) => {
                    this.stats = stats;
                    this.isLoading = false;
                    this.cdr.detectChanges();
                },
                error: () => {
                    this.isLoading = false;
                    this.cdr.detectChanges();
                    this.notificationService.error('Erreur lors du chargement des statistiques.');
                },
            });
    }

    logout(): void {
        sessionStorage.removeItem('adminToken');
        this.router.navigate(['/admin/login']);
    }

    goToDonation(id: string): void {
        this.router.navigate(['/admin/don', id]);
    }

    goToOrder(id: string): void {
        this.router.navigate(['/admin/produit', id]);
    }
}
