import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NewsControllerService } from '@app/services/communication/news/news.communication.service';
import { News } from '@common/interfaces/news';

@Component({
    selector: 'app-news',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './news.component.html',
    styleUrl: './news.component.scss',
})
export class NewsComponent implements OnInit, OnDestroy {
    newsList: News[] = [];
    currentIndex = 0;
    private intervalId: any;

    constructor(
        //private router: Router,
        private newsService: NewsControllerService,
    ) {}

    ngOnInit(): void {
        this.newsService.getAllNews().subscribe((data) => {
            this.newsList = data.slice(0, 5);
        });
        this.intervalId = setInterval(() => this.nextSlide(), 10000);
    }

    ngOnDestroy(): void {
        clearInterval(this.intervalId);
    }

    getTransform(): string {
        return `translateX(-${this.currentIndex * 100}%)`;
    }

    nextSlide(): void {
        this.currentIndex = (this.currentIndex + 1) % this.newsList.length;
    }

    prevSlide(): void {
        this.currentIndex = (this.currentIndex - 1 + this.newsList.length) % this.newsList.length;
    }

    goToSlide(index: number): void {
        this.currentIndex = index;
    }

    formatDate(date: string): string {
        return new Date(date).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    }

    truncate(text: string, max: number): string {
        return text.length > max ? text.slice(0, max) + '…' : text;
    }

    getImageUrl(file: string): string {
        return this.newsService.getImageUrl(file);
    }

    redirectToFullNews() {
        window.location.href = '/actualites';
    }
}
