import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdminSidebarComponent } from '@app/components/admin/admin-sidebar/admin-sidebar.component';
import { DataTableComponent, TableColumn } from '@app/components/admin/data-table/data-table.component';
import { AdminCommunicationService } from '@app/services/communication/admin/admin.communication.service';
import { NotificationService } from '@app/services/notification/notification.service';
import { BaseDestroyableComponent } from '@app/shared/base-destroyable.component';
import { PaymentStatus } from '@common/enums/payment-status';
import { Member } from '@common/interfaces/member';
import { takeUntil } from 'rxjs/operators';

@Component({
    selector: 'app-management-membership-page',
    standalone: true,
    imports: [AdminSidebarComponent, CommonModule, DataTableComponent],
    templateUrl: './management-membership-page.component.html',
    styleUrl: './management-membership-page.component.scss',
})
export class ManagementMembershipPageComponent extends BaseDestroyableComponent implements OnInit {
    PaymentStatus = PaymentStatus;
    members: Member[] = [];
    isLoading = false;

    // Configuration des colonnes du tableau
    columns: TableColumn[] = [
        {
            key: 'firstName',
            label: 'Prénom',
            sortable: true,
            render: (value, row) => (row.isValidated ? '✓ ' : '') + value,
        },
        { key: 'lastName', label: 'Nom', sortable: true },
        { key: 'email', label: 'Email', sortable: true },
        { key: 'typeMember', label: 'Type', sortable: true },
        { key: 'registrationDate', label: 'Date', sortable: true, type: 'date' },
        { key: 'paymentStatus', label: 'Statut', sortable: true, type: 'status' },
    ];

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
        this.adminService
            .getAllMembers()
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

    onRowClick(member: Member): void {
        this.router.navigate(['/admin/membre', member.idMember]);
    }

    onSelectionChange(selected: Member[]): void {
        console.log('Selected members:', selected);
    }
}
