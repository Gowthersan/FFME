import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminSidebarComponent } from '@app/components/admin/admin-sidebar/admin-sidebar.component';
import { LoadingSpinnerComponent } from '@app/components/loading-spinner/loading-spinner.component';
import { AdminCommunicationService } from '@app/services/communication/admin/admin.communication.service';
import { NotificationService } from '@app/services/notification/notification.service';
import { BaseDestroyableComponent } from '@app/shared/base-destroyable.component';
import { PaymentStatus } from '@common/enums/payment-status';
import { Member } from '@common/interfaces/member';
import { takeUntil } from 'rxjs/operators';

@Component({
    selector: 'app-management-membership-page',
    standalone: true,
    imports: [AdminSidebarComponent, CommonModule, RouterLink, LoadingSpinnerComponent],
    templateUrl: './management-membership-page.component.html',
    styleUrl: './management-membership-page.component.scss',
})
export class ManagementMembershipPageComponent extends BaseDestroyableComponent implements OnInit {
    PaymentStatus = PaymentStatus;
    members: Member[] = [];
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
        this.loadMembers();
    }

    loadMembers(): void {
        this.isLoading = true;
        this.adminService.getAllMembers()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (data) => {
                    this.members = data;
                    this.isLoading = false;
                    this.cdr.detectChanges();
                },
                error: () => {
                    this.isLoading = false;
                    this.cdr.detectChanges();
                    this.notificationService.error('Erreur lors du chargement des membres.');
                },
            });
    }

    goToMember(id: string): void {
        this.router.navigate(['/admin/membre', id]);
    }
}
