import { GalleryPhotoModel } from '@app/models/gallery-photo.model';
import { SftpPoolService } from '@app/services/sftp/sftp-pool.service';
import { GalleryPhoto } from '@common/interfaces/gallery-photo';
import mime from 'mime-types';
import sharp from 'sharp';
import { Readable } from 'stream';
import { Service } from 'typedi';
import { v4 as uuidv4 } from 'uuid';

@Service()
export class GalleryDatabaseFtpService {
    constructor(private sftpPool: SftpPoolService) {}

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
        const sftp = await this.sftpPool.acquire();

        try {
            const fullPath = filename.startsWith('galleryImages/') ? filename : `galleryImages/${filename}`;

            const buffer = await sftp.get(fullPath);
            const mimeType = mime.lookup(filename) || 'application/octet-stream';

            const stream = Readable.from(buffer);

            return { stream, mime: mimeType.toString() };
        } catch (err) {
            throw new Error(`Erreur SFTP lors du téléchargement de l'image : ${err.message}`);
        } finally {
            this.sftpPool.release(sftp);
        }
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

            const saved = await GalleryPhotoModel.create({
                image: uniqueFilename,
                eventName,
                description,
                date: new Date().toISOString(),
            });

            return saved;
        } catch (err) {
            throw new Error(`Erreur SFTP upload : ${err.message}`);
        } finally {
            this.sftpPool.release(sftp);
        }
    }

    async uploadPhotos(files: Express.Multer.File[], eventName: string, description: string): Promise<GalleryPhoto[]> {
        const sftp = await this.sftpPool.acquire();
        const remoteDir = `galleryImages/${eventName}`;
        const photosToInsert: { image: string; eventName: string; description: string; date: string }[] = [];

        try {
            await sftp.mkdir(remoteDir, true);

            for (const file of files) {
                const uniqueFilename = `galleryImages/${eventName}/${uuidv4()}.webp`;

                const compressedBuffer = await sharp(file.buffer)
                    .resize({ width: 1280 })
                    .webp({ quality: 70 })
                    .toBuffer();

                await sftp.put(compressedBuffer, uniqueFilename);

                photosToInsert.push({
                    image: uniqueFilename,
                    eventName,
                    description,
                    date: new Date().toISOString(),
                });
            }

            const savedPhotos = await GalleryPhotoModel.insertMany(photosToInsert);
            return savedPhotos;
        } catch (err) {
            throw new Error(`Erreur SFTP upload batch : ${err.message}`);
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
            await GalleryPhotoModel.deleteOne({ _id: id });
            return true;
        } catch (err) {
            console.error('Erreur suppression fichier sur SFTP :', err);
            return false;
        } finally {
            this.sftpPool.release(sftp);
        }
    }
}
