import { NewsModel } from '@app/models/news.model';
import { SftpPoolService } from '@app/services/sftp/sftp-pool.service';
import { News } from '@common/interfaces/news';
import mime from 'mime-types';
import sharp from 'sharp';
import { Readable } from 'stream';
import { Service } from 'typedi';
import { v4 as uuidv4 } from 'uuid';

@Service()
export class NewsDatabaseFtpService {
    constructor(private sftpPool: SftpPoolService) {}

    async getAll(): Promise<News[]> {
        return NewsModel.find().sort({ date: -1 }).lean();
    }

    async getById(id: string): Promise<News | null> {
        return NewsModel.findById(id).lean();
    }

    async streamImage(filename: string): Promise<{ stream: Readable; mime: string }> {
        const sftp = await this.sftpPool.acquire();
        try {
            const fullPath = filename.startsWith('newsImages/') ? filename : `newsImages/${filename}`;
            const buffer = await sftp.get(fullPath);
            const mimeType = mime.lookup(filename) || 'application/octet-stream';
            const stream = Readable.from(buffer);
            return { stream, mime: mimeType.toString() };
        } finally {
            this.sftpPool.release(sftp);
        }
    }

    async uploadNews(file: Express.Multer.File, title: string, description: string, date: string, externalLink?: string): Promise<News> {
        const sftp = await this.sftpPool.acquire();
        const extension = '.webp';
        const uniqueFilename = `newsImages/${uuidv4()}${extension}`;
        try {
            const compressed = await sharp(file.buffer).resize({ width: 1280 }).webp({ quality: 70 }).toBuffer();

            await sftp.mkdir('newsImages', true);
            await sftp.put(compressed, uniqueFilename);

            return await NewsModel.create({
                image: uniqueFilename,
                title,
                description,
                date,
                ...(externalLink && { externalLink }),
            });
        } finally {
            this.sftpPool.release(sftp);
        }
    }

    async updateNews(id: string, title: string, description: string, date: string, externalLink?: string): Promise<News | null> {
        return NewsModel.findByIdAndUpdate(id, { title, description, date, externalLink: externalLink || null }, { new: true }).lean();
    }

    async deleteNews(id: string): Promise<boolean> {
        const news = await NewsModel.findById(id);
        if (!news) return false;

        const sftp = await this.sftpPool.acquire();
        try {
            await sftp.delete(news.image);
            await NewsModel.deleteOne({ _id: id });
            return true;
        } catch {
            return false;
        } finally {
            this.sftpPool.release(sftp);
        }
    }
}
