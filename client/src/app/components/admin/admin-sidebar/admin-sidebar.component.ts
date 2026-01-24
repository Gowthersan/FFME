import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-admin-sidebar',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './admin-sidebar.component.html',
    styleUrl: './admin-sidebar.component.scss',
})
export class AdminSidebarComponent {
    logout(): void {
        sessionStorage.removeItem('adminToken');
        window.location.href = '/admin/login';
    }
}
