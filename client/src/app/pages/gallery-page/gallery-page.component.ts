import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import { NavbarComponent } from '@app/components/navbar/navbar.component';
import { TitleComponent } from '@app/components/title/title.component';
import { FooterComponent } from '@app/components/footer/footer.component';
import { GalleryCommunicationService } from '@app/services/communication/gallery/gallery.communication.service';
import { BaseDestroyableComponent } from '@app/shared/base-destroyable.component';
import { GalleryPhoto } from '@common/interfaces/gallery-photo';
import { takeUntil } from 'rxjs/operators';

interface DisplayPhoto {
    imageUrl: string;
    eventName: string;
    description: string;
    imageId: string;
    loaded: boolean;
}

@Component({
    selector: 'app-gallery-page',
    standalone: true,
    imports: [CommonModule, FormsModule, NavbarComponent, TitleComponent, FooterComponent],
    templateUrl: './gallery-page.component.html',
    styleUrl: './gallery-page.component.scss',
    animations: [
        trigger('fadeIn', [
            transition(':enter', [
                style({ opacity: 0 }),
                animate('200ms ease-out', style({ opacity: 1 }))
            ]),
            transition(':leave', [
                animate('150ms ease-in', style({ opacity: 0 }))
            ])
        ])
    ]
})
export class GalleryPageComponent extends BaseDestroyableComponent implements OnInit, OnDestroy {
    galleryPhotos: GalleryPhoto[] = [];
    remainingPhotos: GalleryPhoto[] = [];
    photosToDisplay: DisplayPhoto[] = [];

    events: string[] = [];
    selectedEvent: string | null = null;
    searchQuery = '';
    photosPerBatch = 12;

    isLoading = true;
    isLoadingMore = false;
    filteredTotal = 0;

    // Lightbox
    lightboxOpen = false;
    currentIndex = 0;

    imageCache: Map<string, string> = new Map();
    readonly MAX_CACHE_SIZE = 100;

    private touchStartX = 0;
    private touchEndX = 0;

    constructor(
        private galleryCommService: GalleryCommunicationService,
        private cdr: ChangeDetectorRef,
    ) {
        super();
    }

    ngOnInit(): void {
        document.body.classList.add('gallery-page');

        this.galleryCommService.getAllPhotos()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (photos) => {
                    this.galleryPhotos = photos;
                    this.isLoading = false;

                    for (const photo of photos) {
                        const url = this.galleryCommService.getImageStream(photo.image);
                        this.imageCache.set(photo.image, url);
                    }

                    const rawEvents = photos.map((p) => p.eventName).filter(Boolean);
                    this.events = Array.from(new Set(rawEvents)).sort();

                    this.applyFilters();
                    this.cdr.detectChanges();
                },
                error: () => {
                    this.isLoading = false;
                    this.cdr.detectChanges();
                    console.error('Erreur chargement galerie');
                }
            });
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
        document.body.classList.remove('gallery-page');
        this.closeLightbox();
    }

    // ===== Filtres et recherche =====

    getEventCount(eventName: string): number {
        return this.galleryPhotos.filter(p => p.eventName === eventName).length;
    }

    selectEvent(event: string | null): void {
        this.selectedEvent = event;
        this.applyFilters();
    }

    onSearchChange(): void {
        this.applyFilters();
    }

    clearSearch(): void {
        this.searchQuery = '';
        this.applyFilters();
    }

    private applyFilters(): void {
        let filtered = [...this.galleryPhotos];

        // Filtre par événement
        if (this.selectedEvent) {
            filtered = filtered.filter(p => p.eventName === this.selectedEvent);
        }

        // Filtre par recherche
        if (this.searchQuery.trim()) {
            const query = this.searchQuery.toLowerCase().trim();
            filtered = filtered.filter(p =>
                p.eventName?.toLowerCase().includes(query) ||
                p.description?.toLowerCase().includes(query)
            );
        }

        this.filteredTotal = filtered.length;
        this.remainingPhotos = [...filtered];
        this.photosToDisplay = [];
        this.addRandomPhotos();
    }

    // ===== Gestion des photos =====

    getImageWithCache(fileName: string): string {
        if (this.imageCache.has(fileName)) {
            return this.imageCache.get(fileName)!;
        }

        const imageUrl = this.galleryCommService.getImageStream(fileName);
        this.imageCache.set(fileName, imageUrl);

        if (this.imageCache.size > this.MAX_CACHE_SIZE) {
            const oldestKey = this.imageCache.keys().next().value;
            if (oldestKey) this.imageCache.delete(oldestKey);
        }

        return imageUrl;
    }

    addRandomPhotos(): void {
        this.isLoadingMore = true;
        const batch: GalleryPhoto[] = [];
        const alreadyDisplayed = new Set(this.photosToDisplay.map((p) => p.imageId));
        const eligiblePhotos = this.remainingPhotos.filter(
            (p) => !alreadyDisplayed.has(p.image) && this.imageCache.has(p.image)
        );

        for (let i = 0; i < this.photosPerBatch && eligiblePhotos.length > 0; i++) {
            const randomIndex = Math.floor(Math.random() * eligiblePhotos.length);
            const photo = eligiblePhotos.splice(randomIndex, 1)[0];
            batch.push(photo);
            this.remainingPhotos = this.remainingPhotos.filter((p) => p.image !== photo.image);
        }

        this.photosToDisplay.push(
            ...batch.map((photo) => ({
                imageId: photo.image,
                imageUrl: this.getImageWithCache(photo.image),
                eventName: photo.eventName,
                description: photo.description,
                loaded: false,
            }))
        );

        setTimeout(() => {
            this.isLoadingMore = false;
        }, 300);
    }

    onImageLoad(photo: DisplayPhoto): void {
        photo.loaded = true;
    }

    // ===== Lightbox =====

    get currentLightboxPhoto(): DisplayPhoto | null {
        return this.photosToDisplay[this.currentIndex] || null;
    }

    openLightbox(index: number): void {
        this.currentIndex = index;
        this.lightboxOpen = true;
        document.body.style.overflow = 'hidden';
    }

    closeLightbox(): void {
        this.lightboxOpen = false;
        document.body.style.overflow = '';
    }

    prevPhoto(): void {
        if (this.currentIndex > 0) {
            this.currentIndex--;
        } else {
            this.currentIndex = this.photosToDisplay.length - 1;
        }
    }

    nextPhoto(): void {
        if (this.currentIndex < this.photosToDisplay.length - 1) {
            this.currentIndex++;
        } else {
            this.currentIndex = 0;
        }
    }

    goToPhoto(index: number): void {
        this.currentIndex = index;
    }

    // ===== Événements clavier =====

    @HostListener('document:keydown', ['$event'])
    handleKeydown(event: KeyboardEvent): void {
        if (!this.lightboxOpen) return;

        switch (event.key) {
            case 'Escape':
                this.closeLightbox();
                break;
            case 'ArrowLeft':
                this.prevPhoto();
                break;
            case 'ArrowRight':
                this.nextPhoto();
                break;
        }
    }

    // ===== Gestes tactiles pour le lightbox =====

    @HostListener('touchstart', ['$event'])
    onTouchStart(event: TouchEvent): void {
        if (!this.lightboxOpen) return;
        this.touchStartX = event.changedTouches[0].screenX;
    }

    @HostListener('touchend', ['$event'])
    onTouchEnd(event: TouchEvent): void {
        if (!this.lightboxOpen) return;
        this.touchEndX = event.changedTouches[0].screenX;
        this.handleSwipe();
    }

    private handleSwipe(): void {
        const swipeThreshold = 50;
        const diff = this.touchStartX - this.touchEndX;

        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                this.nextPhoto();
            } else {
                this.prevPhoto();
            }
        }
    }
}
