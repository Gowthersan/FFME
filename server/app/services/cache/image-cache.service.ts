import { SftpPoolService } from '@app/services/sftp/sftp-pool.service';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { Service } from 'typedi';
import pLimit from 'p-limit';

interface CacheEntry {
    localPath: string;
    remotePath: string;
    mimeType: string;
    size: number;
    cachedAt: Date;
}

@Service()
export class ImageCacheService {
    private readonly cacheDir = process.env.IMAGE_CACHE_DIR || '/tmp/ffme-cache';
    private readonly cacheIndex = new Map<string, CacheEntry>();
    private isInitialized = false;
    private initializationPromise: Promise<void> | null = null;

    // Dossiers SFTP a synchroniser
    private readonly remoteDirs = ['galleryImages', 'newsImages', 'productImages'];

    // Limite de telechargements paralleles
    private readonly parallelLimit = 10;

    constructor(private readonly sftpPool: SftpPoolService) {}

    /**
     * Initialise le cache au demarrage du serveur
     * - Cree le dossier de cache
     * - Liste tous les fichiers SFTP
     * - Telecharge tous les fichiers
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = this._doInitialize();
        return this.initializationPromise;
    }

    private async _doInitialize(): Promise<void> {
        console.log('🖼️  Initialisation du cache d\'images...');
        const startTime = Date.now();

        try {
            // 1. Creer/nettoyer le dossier de cache
            await this.setupCacheDirectory();

            // 2. Lister tous les fichiers SFTP
            const allFiles = await this.listAllRemoteFiles();
            console.log(`📋 ${allFiles.length} images a synchroniser`);

            if (allFiles.length === 0) {
                console.log('✅ Aucune image a synchroniser');
                this.isInitialized = true;
                return;
            }

            // 3. Telecharger en parallele avec limite
            await this.downloadAllFiles(allFiles);

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ Cache d'images initialise: ${this.cacheIndex.size} fichiers en ${elapsed}s`);
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Erreur initialisation cache:', error);
            // Ne pas bloquer le demarrage si le SFTP est down
            this.isInitialized = true;
        }
    }

    private async setupCacheDirectory(): Promise<void> {
        // Supprimer le cache existant si present (clean start)
        try {
            await fs.rm(this.cacheDir, { recursive: true, force: true });
        } catch {
            // Ignorer si le dossier n'existe pas
        }

        // Creer la structure de dossiers
        await fs.mkdir(path.join(this.cacheDir, 'galleryImages'), { recursive: true });
        await fs.mkdir(path.join(this.cacheDir, 'newsImages'), { recursive: true });
        await fs.mkdir(path.join(this.cacheDir, 'productImages'), { recursive: true });
    }

    private async listAllRemoteFiles(): Promise<string[]> {
        const allFiles: string[] = [];
        let sftp = null;

        try {
            sftp = await this.sftpPool.acquire();

            for (const dir of this.remoteDirs) {
                try {
                    const files = await this.listDirectoryRecursive(sftp, dir);
                    allFiles.push(...files);
                } catch (err) {
                    console.warn(`⚠️  Impossible de lister ${dir}:`, (err as Error).message);
                }
            }
        } finally {
            if (sftp) this.sftpPool.release(sftp);
        }

        return allFiles;
    }

    private async listDirectoryRecursive(sftp: ReturnType<typeof this.sftpPool.acquire> extends Promise<infer T> ? T : never, dirPath: string): Promise<string[]> {
        const files: string[] = [];

        try {
            const items = await sftp.list(dirPath);

            for (const item of items) {
                const fullPath = `${dirPath}/${item.name}`;
                if (item.type === 'd') {
                    // Recursion pour les sous-dossiers (ex: galleryImages/eventName/)
                    const subFiles = await this.listDirectoryRecursive(sftp, fullPath);
                    files.push(...subFiles);
                } else if (item.type === '-') {
                    // Fichier
                    files.push(fullPath);
                }
            }
        } catch (err) {
            // Dossier n'existe pas ou erreur de lecture
            console.warn(`⚠️  Erreur lecture ${dirPath}:`, (err as Error).message);
        }

        return files;
    }

    private async downloadAllFiles(remotePaths: string[]): Promise<void> {
        const limit = pLimit(this.parallelLimit);
        let completed = 0;
        const total = remotePaths.length;

        const downloadPromises = remotePaths.map((remotePath) =>
            limit(async () => {
                try {
                    await this.downloadAndCache(remotePath);
                    completed++;
                    if (completed % 50 === 0 || completed === total) {
                        console.log(`📥 Progression: ${completed}/${total} images`);
                    }
                } catch (err) {
                    console.warn(`⚠️  Echec telechargement ${remotePath}:`, (err as Error).message);
                }
            }),
        );

        await Promise.all(downloadPromises);
    }

    private async downloadAndCache(remotePath: string): Promise<void> {
        const localPath = path.join(this.cacheDir, remotePath);

        // Creer le dossier parent si necessaire
        await fs.mkdir(path.dirname(localPath), { recursive: true });

        let sftp = null;
        try {
            sftp = await this.sftpPool.acquire();
            const buffer = await sftp.get(remotePath);
            await fs.writeFile(localPath, buffer);

            // Indexer dans le cache
            const mimeType = this.getMimeType(remotePath);
            const stats = await fs.stat(localPath);

            this.cacheIndex.set(remotePath, {
                localPath,
                remotePath,
                mimeType,
                size: stats.size,
                cachedAt: new Date(),
            });
        } finally {
            if (sftp) this.sftpPool.release(sftp);
        }
    }

    /**
     * Recupere une image depuis le cache (ou SFTP si pas en cache)
     */
    async getImage(remotePath: string): Promise<{ stream: Readable; mime: string }> {
        // Attendre l'initialisation si en cours
        await this.initialize();

        // Verifier le cache
        const cached = this.cacheIndex.get(remotePath);
        if (cached && fsSync.existsSync(cached.localPath)) {
            const stream = fsSync.createReadStream(cached.localPath);
            return { stream, mime: cached.mimeType };
        }

        // Cache miss: telecharger et mettre en cache
        console.log(`📥 Cache miss: ${remotePath}`);
        await this.downloadAndCache(remotePath);

        const entry = this.cacheIndex.get(remotePath);
        if (!entry) {
            throw new Error(`Image non trouvee: ${remotePath}`);
        }

        const stream = fsSync.createReadStream(entry.localPath);
        return { stream, mime: entry.mimeType };
    }

    /**
     * Ajoute une image au cache (apres upload)
     */
    async addToCache(remotePath: string, buffer: Buffer): Promise<void> {
        const localPath = path.join(this.cacheDir, remotePath);

        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await fs.writeFile(localPath, buffer);

        this.cacheIndex.set(remotePath, {
            localPath,
            remotePath,
            mimeType: this.getMimeType(remotePath),
            size: buffer.length,
            cachedAt: new Date(),
        });

        console.log(`➕ Image ajoutee au cache: ${remotePath}`);
    }

    /**
     * Supprime une image du cache
     */
    async removeFromCache(remotePath: string): Promise<void> {
        const entry = this.cacheIndex.get(remotePath);
        if (entry) {
            try {
                await fs.unlink(entry.localPath);
            } catch {
                // Ignorer si le fichier n'existe pas
            }
            this.cacheIndex.delete(remotePath);
            console.log(`🗑️  Image supprimee du cache: ${remotePath}`);
        }
    }

    /**
     * Nettoie completement le cache (arret serveur)
     */
    async cleanup(): Promise<void> {
        console.log('🧹 Nettoyage du cache d\'images...');
        try {
            await fs.rm(this.cacheDir, { recursive: true, force: true });
            this.cacheIndex.clear();
            console.log('✅ Cache nettoye');
        } catch (err) {
            console.error('❌ Erreur nettoyage cache:', err);
        }
    }

    /**
     * Statistiques du cache
     */
    getStats(): { files: number; size: number; sizeFormatted: string } {
        let totalSize = 0;
        for (const entry of this.cacheIndex.values()) {
            totalSize += entry.size;
        }
        return {
            files: this.cacheIndex.size,
            size: totalSize,
            sizeFormatted: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
        };
    }

    private getMimeType(filename: string): string {
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.webp': 'image/webp',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    isReady(): boolean {
        return this.isInitialized;
    }
}
