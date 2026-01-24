import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ApiEndpoints } from '@common/enums/api-endpoints';
import { GalleryPhoto } from '@common/interfaces/gallery-photo';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
    providedIn: 'root',
})
export class GalleryCommunicationService {
    private readonly baseUrl: string = `${environment.serverUrl}${ApiEndpoints.GALLERY}`;

    constructor(private readonly http: HttpClient) {}

    getAllPhotos(): Observable<GalleryPhoto[]> {
        return this.http.get<GalleryPhoto[]>(`${this.baseUrl}`);
    }

    getPhotosByEvent(eventName: string): Observable<GalleryPhoto[]> {
        return this.http.get<GalleryPhoto[]>(`${this.baseUrl}event/${encodeURIComponent(eventName)}`);
    }

    getPhotoById(id: string): Observable<GalleryPhoto> {
        return this.http.get<GalleryPhoto>(`${this.baseUrl}/${id}`);
    }

    getImageStream(fileName: string): string {
        return `${this.baseUrl}image/${encodeURIComponent(fileName)}`;
    }
}
