// src/app/controllers/gallery.controller.ts
import { connectionLimiter } from '@app/middlewares/connectionLimiter.middleware';
import { imageRateLimiter } from '@app/middlewares/imageRateLimiter.middleware';
import { GalleryDatabaseFtpService } from '@app/services/database/gallery/gallery.database.ftp.service';
import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { Service } from 'typedi';

@Service()
export class GalleryController {
    router: Router;

    constructor(private readonly galleryDbService: GalleryDatabaseFtpService) {
        this.router = Router();
        this.configureRoutes();
    }

    private configureRoutes(): void {
        this.router.get('/', async (req: Request, res: Response) => {
            try {
                const photos = await this.galleryDbService.getAll();
                return res.status(StatusCodes.OK).json(photos);
            } catch (err) {
                console.error('❌ Erreur chargement galerie:', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur' });
            }
        });

        this.router.get('/event/:eventName', async (req: Request, res: Response) => {
            try {
                const eventName = req.params.eventName as string;
                const photos = await this.galleryDbService.getByEvent(eventName);
                return res.status(StatusCodes.OK).json(photos);
            } catch (err) {
                console.error('❌ Erreur chargement événement:', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur' });
            }
        });

        this.router.get('/image/:filename', imageRateLimiter, connectionLimiter, async (req: Request, res: Response) => {
            const filename = req.params.filename as string;

            try {
                const { stream, mime } = await this.galleryDbService.streamImage(filename);
                res.setHeader('Content-Type', mime);
                res.setHeader('Content-Disposition', 'inline');
                stream.pipe(res);
            } catch (err) {
                console.error('❌ Erreur streaming image GridFS', err);
                res.status(500).json({ message: "Erreur lors de l'affichage de l'image." });
            }
        });

        this.router.get('/:id', async (req: Request, res: Response) => {
            try {
                const id = req.params.id as string;
                const photo = await this.galleryDbService.getById(id);
                if (!photo) {
                    return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Photo introuvable' });
                }
                return res.status(StatusCodes.OK).json(photo);
            } catch (err) {
                console.error('❌ Erreur récupération photo:', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur' });
            }
        });
    }
}
