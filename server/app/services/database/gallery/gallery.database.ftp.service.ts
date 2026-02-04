import { GalleryPhotoModel } from '@app/models/gallery-photo.model';
import { ImageCacheService } from '@app/services/cache/image-cache.service';
import { SftpPoolService } from '@app/services/sftp/sftp-pool.service';
import { GalleryPhoto } from '@common/interfaces/gallery-photo';
import sharp from 'sharp';
import { Readable } from 'stream';
import { Service } from 'typedi';
import { v4 as uuidv4 } from 'uuid';

@Service()
export class GalleryDatabaseFtpService {
    constructor(
        private sftpPool: SftpPoolService,
        private imageCache: ImageCacheService,
    ) {}

    async getAll(): Promise<GalleryPhoto[]> {
        return GalleryPhotoModel.find().lean();
    }

    async getById(id: string): Promise<GalleryPhoto | null> {
        return GalleryPhotoModel.findById(id).lean();
    }

    async getByEvent(eventName: string): Promise<GalleryPhoto[]> {
        return GalleryPhotoModel.find({ eventName }).lean();
    }

    async streamImage(filename: string): Promise<{ stream: Readable; mime: string }> {
        const fullPath = filename.startsWith('galleryImages/') ? filename : `galleryImages/${filename}`;
        return this.imageCache.getImage(fullPath);
    }

    async uploadPhoto(file: Express.Multer.File, eventName: string, description: string): Promise<GalleryPhoto> {
        const sftp = await this.sftpPool.acquire();

        const extension = '.webp';
        const uniqueFilename = `galleryImages/${eventName}/${uuidv4()}${extension}`;
        const remoteDir = `galleryImages/${eventName}`;

        try {
            const compressedBuffer = await sharp(file.buffer)
                .resize({ width: 1280 })
                .webp({ quality: 70 })
                .toBuffer();

            await sftp.mkdir(remoteDir, true);
            await sftp.put(compressedBuffer, uniqueFilename);

            // Ajouter au cache apres upload SFTP reussi
            await this.imageCache.addToCache(uniqueFilename, compressedBuffer);

            const saved = await GalleryPhotoModel.create({
                image: uniqueFilename,
                eventName,
                description,
                date: new Date().toISOString(),
            });

            return saved;
        } catch (err) {
            throw new Error(`Erreur SFTP upload : ${(err as Error).message}`);
        } finally {
            this.sftpPool.release(sftp);
        }
    }

    async uploadPhotos(files: Express.Multer.File[], eventName: string, description: string): Promise<GalleryPhoto[]> {
        const sftp = await this.sftpPool.acquire();
        const remoteDir = `galleryImages/${eventName}`;
        const photosToInsert: { image: string; eventName: string; description: string; date: string }[] = [];
        const compressedBuffers: Map<string, Buffer> = new Map();

        try {
            await sftp.mkdir(remoteDir, true);

            for (const file of files) {
                const uniqueFilename = `galleryImages/${eventName}/${uuidv4()}.webp`;

                const compressedBuffer = await sharp(file.buffer)
                    .resize({ width: 1280 })
                    .webp({ quality: 70 })
                    .toBuffer();

                await sftp.put(compressedBuffer, uniqueFilename);

                // Stocker le buffer pour l'ajout au cache
                compressedBuffers.set(uniqueFilename, compressedBuffer);

                photosToInsert.push({
                    image: uniqueFilename,
                    eventName,
                    description,
                    date: new Date().toISOString(),
                });
            }

            // Ajouter toutes les images au cache
            for (const [filename, buffer] of compressedBuffers) {
                await this.imageCache.addToCache(filename, buffer);
            }

            const savedPhotos = await GalleryPhotoModel.insertMany(photosToInsert);
            return savedPhotos;
        } catch (err) {
            throw new Error(`Erreur SFTP upload batch : ${(err as Error).message}`);
        } finally {
            this.sftpPool.release(sftp);
        }
    }

    async updatePhoto(id: string, eventName: string, description: string): Promise<GalleryPhoto | null> {
        //this.compressAndReupload();
        return GalleryPhotoModel.findByIdAndUpdate(id, { eventName, description }, { new: true }).lean();
    }

    async deletePhoto(id: string): Promise<boolean> {
        const photo = await GalleryPhotoModel.findById(id);
        if (!photo) return false;

        const sftp = await this.sftpPool.acquire();

        try {
            await sftp.delete(photo.image);

            // Supprimer du cache
            await this.imageCache.removeFromCache(photo.image);

            await GalleryPhotoModel.deleteOne({ _id: id });
            return true;
        } catch (err) {
            console.error('Erreur suppression fichier sur SFTP :', err);
            return false;
        } finally {
            this.sftpPool.release(sftp);
        }
    }

    async deleteEvent(eventName: string): Promise<{ success: boolean; deletedCount: number }> {
        const photos = await GalleryPhotoModel.find({ eventName });
        if (photos.length === 0) {
            return { success: true, deletedCount: 0 };
        }

        const sftp = await this.sftpPool.acquire();
        let deletedCount = 0;

        try {
            for (const photo of photos) {
                try {
                    await sftp.delete(photo.image);
                    await this.imageCache.removeFromCache(photo.image);
                    deletedCount++;
                } catch (err) {
                    console.error(`Erreur suppression fichier ${photo.image}:`, err);
                }
            }

            // Supprimer le dossier de l'evenement si vide
            try {
                const remoteDir = `galleryImages/${eventName}`;
                await sftp.rmdir(remoteDir, true);
            } catch {
                // Le dossier n'existe peut-etre pas ou n'est pas vide
            }

            // Supprimer toutes les photos de la BDD
            await GalleryPhotoModel.deleteMany({ eventName });

            return { success: true, deletedCount };
        } catch (err) {
            console.error('Erreur suppression evenement:', err);
            return { success: false, deletedCount };
        } finally {
            this.sftpPool.release(sftp);
        }
    }
}
