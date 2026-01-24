import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FooterComponent } from '@app/components/footer/footer.component';
import { LoadingSpinnerComponent } from '@app/components/loading-spinner/loading-spinner.component';
import { NavbarComponent } from '@app/components/navbar/navbar.component';
import { TitleComponent } from '@app/components/title/title.component';
import { NewsControllerService } from '@app/services/communication/news/news.communication.service';
import { BaseDestroyableComponent } from '@app/shared/base-destroyable.component';
import { News } from '@common/interfaces/news';
import { takeUntil } from 'rxjs/operators';

@Component({
    selector: 'app-news-page',
    standalone: true,
    imports: [CommonModule, NavbarComponent, TitleComponent, FooterComponent, LoadingSpinnerComponent],
    templateUrl: './news-page.component.html',
    styleUrl: './news-page.component.scss',
})
export class NewsPageComponent extends BaseDestroyableComponent implements OnInit {
    isLoading = true;
    newsList: News[] = [];
    currentPage: number = 1;
    pageSize: number = 3;
    expandedNews: Set<string> = new Set();

    constructor(
        private newsService: NewsControllerService,
        private cdr: ChangeDetectorRef,
    ) {
        super();
    }

    ngOnInit(): void {
        this.newsService.getAllNews()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (data) => {
                    this.newsList = data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    this.isLoading = false;
                    this.cdr.detectChanges();
                },
                error: () => {
                    this.isLoading = false;
                    this.cdr.detectChanges();
                    console.error('Erreur chargement actualités');
                },
            });
    }

    paginatedNews(): News[] {
        const start = (this.currentPage - 1) * this.pageSize;
        return this.newsList.slice(start, start + this.pageSize);
    }

    get totalPages(): number {
        return Math.ceil(this.newsList.length / this.pageSize);
    }

    goToPage(page: number): void {
        this.currentPage = page;
    }

    formatDate(date: string): string {
        const d = new Date(date);
        return d.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        });
    }

    truncate(text: string, maxLength: number): string {
        return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
    }

    toggleExpanded(news: News): void {
        const key = news.title; // ou use `news._id` si dispo
        if (this.expandedNews.has(key)) {
            this.expandedNews.delete(key);
        } else {
            this.expandedNews.add(key);
        }
    }
    getImageUrl(file: string): string {
        return this.newsService.getImageUrl(file);
    }
    isExpanded(news: News): boolean {
        return this.expandedNews.has(news.title); // ou `.has(news._id)`
    }
}
