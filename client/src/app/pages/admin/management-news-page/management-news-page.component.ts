import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { AdminSidebarComponent } from '@app/components/admin/admin-sidebar/admin-sidebar.component';
import { FormNewsComponent } from '@app/components/admin/form-news/form-news.component';
import { LoadingSpinnerComponent } from '@app/components/loading-spinner/loading-spinner.component';
import { AdminCommunicationService } from '@app/services/communication/admin/admin.communication.service';
import { NotificationService } from '@app/services/notification/notification.service';
import { BaseDestroyableComponent } from '@app/shared/base-destroyable.component';
import { News } from '@common/interfaces/news';
import { takeUntil } from 'rxjs/operators';

@Component({
    selector: 'app-management-news-page',
    standalone: true,
    imports: [CommonModule, AdminSidebarComponent, LoadingSpinnerComponent, FormNewsComponent],
    templateUrl: './management-news-page.component.html',
    styleUrl: './management-news-page.component.scss',
})
export class ManagementNewsPageComponent extends BaseDestroyableComponent implements OnInit {
    newsList: News[] = [];
    showModal = false;
    isEditMode = false;
    newsToEdit: News | null = null;
    imageCache = new Map<string, string>();
    isLoading = false;

    constructor(
        private adminCommService: AdminCommunicationService,
        private notificationService: NotificationService,
        private cdr: ChangeDetectorRef,
    ) {
        super();
    }

    ngOnInit(): void {
        this.loadNews();
    }

    loadNews(): void {
        this.isLoading = true;
        this.adminCommService.getAllNews()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (news) => {
                    this.newsList = news;
                    for (const n of news) {
                        this.imageCache.set(n.image, this.getImageWithCache(n.image));
                    }
                    this.isLoading = false;
                    this.cdr.detectChanges();
                },
                error: () => {
                    this.isLoading = false;
                    this.cdr.detectChanges();
                    this.notificationService.error('Erreur lors du chargement des actualités.');
                },
            });
    }

    getImageWithCache(filename: string): string {
        if (this.imageCache.has(filename)) {
            return this.imageCache.get(filename)!;
        }

        const url = this.adminCommService.getNewsImageUrl(filename);
        this.imageCache.set(filename, url);
        return url;
    }

    openForm(): void {
        this.isEditMode = false;
        this.newsToEdit = null;
        this.showModal = true;
    }

    editNews(news: News): void {
        this.newsToEdit = news;
        this.isEditMode = true;
        this.showModal = true;
    }

    closeForm(): void {
        this.showModal = false;
    }

    handleFormSubmit(formData: FormData): void {
        this.isLoading = true;

        if (this.isEditMode && this.newsToEdit?._id) {
            const payload = {
                title: formData.get('title') as string,
                description: formData.get('description') as string,
                date: formData.get('date') as string,
            };

            this.adminCommService.updateNews(this.newsToEdit._id, payload)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: (updatedNews: News) => {
                        const index = this.newsList.findIndex((n) => n._id === this.newsToEdit?._id);
                        if (index !== -1) {
                            this.newsList[index] = updatedNews;
                        }
                        this.showModal = false;
                        this.isLoading = false;
                        this.cdr.detectChanges();
                        this.notificationService.success('Actualité mise à jour avec succès.');
                    },
                    error: () => {
                        this.isLoading = false;
                        this.cdr.detectChanges();
                        this.notificationService.error('Erreur lors de la mise à jour.');
                    },
                });
        } else {
            this.adminCommService.postNews(formData)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: (newNews: News) => {
                        this.newsList.unshift(newNews);
                        this.imageCache.set(newNews.image, this.getImageWithCache(newNews.image));
                        this.showModal = false;
                        this.isLoading = false;
                        this.cdr.detectChanges();
                        this.notificationService.success('Actualité créée avec succès.');
                    },
                    error: () => {
                        this.isLoading = false;
                        this.cdr.detectChanges();
                        this.notificationService.error('Erreur lors de la création.');
                    },
                });
        }
    }

    handleNewsDelete(newsId: string): void {
        this.isLoading = true;

        this.adminCommService.deleteNews(newsId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.newsList = this.newsList.filter((n) => n._id !== newsId);
                    this.showModal = false;
                    this.isLoading = false;
                    this.cdr.detectChanges();
                    this.notificationService.success('Actualité supprimée avec succès.');
                },
                error: () => {
                    this.isLoading = false;
                    this.cdr.detectChanges();
                    this.notificationService.error('Erreur lors de la suppression.');
                },
            });
    }
}
