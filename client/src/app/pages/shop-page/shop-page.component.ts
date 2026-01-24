import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { DialogPrefaceComponent } from '@app/components/dialog-preface/dialog-preface.component';
import { CachedImageComponent } from '@app/components/shared/cached-image/cached-image.component';
import { ProductCommunicationService } from '@app/services/communication/product/product.communication.service';
import { ImageCacheService } from '@app/services/image-cache/image-cache.service';
import { BaseDestroyableComponent } from '@app/shared/base-destroyable.component';
import { Product } from '@common/interfaces/product';
import { takeUntil } from 'rxjs/operators';

@Component({
    selector: 'app-shop-page',
    standalone: true,
    imports: [CommonModule, RouterLink, CachedImageComponent],
    templateUrl: './shop-page.component.html',
    styleUrl: './shop-page.component.scss',
})
export class ShopPageComponent extends BaseDestroyableComponent implements OnInit {
    products: Product[] = [];
    isLoading = true;

    constructor(
        private dialog: MatDialog,
        private productService: ProductCommunicationService,
        private imageCacheService: ImageCacheService,
        private cdr: ChangeDetectorRef,
    ) {
        super();
    }

    ngOnInit(): void {
        this.productService.getAllProducts()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (products) => {
                    this.products = products;
                    // Preload all product images
                    const imageUrls = products.map((p) => this.getProductImageUrl(p.image));
                    this.imageCacheService.preloadImages(imageUrls);
                    this.isLoading = false;
                    this.cdr.detectChanges();
                },
                error: () => {
                    this.isLoading = false;
                    this.cdr.detectChanges();
                    console.error('Erreur chargement produits');
                },
            });
    }

    getProductImageUrl(filename: string): string {
        return this.productService.getImageUrl(filename);
    }

    openPreface(): void {
        this.dialog.open(DialogPrefaceComponent, {
            width: '80%',
            maxWidth: '500px',
        });
    }
}
