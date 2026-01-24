// services/controller/news.controller.service.ts
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ApiEndpoints } from '@common/enums/api-endpoints';
import { News } from '@common/interfaces/news';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
    providedIn: 'root',
})
export class NewsControllerService {
    private readonly baseUrl = `${environment.serverUrl}${ApiEndpoints.NEWS}`;

    constructor(private http: HttpClient) {}

    getAllNews(): Observable<News[]> {
        return this.http.get<News[]>(`${this.baseUrl}`);
    }

    getNewsById(id: string): Observable<News> {
        return this.http.get<News>(`${this.baseUrl}${id}`, {});
    }

    getImageUrl(filename: string): string {
        return `${this.baseUrl}image/${encodeURIComponent(filename)}`;
    }
}
