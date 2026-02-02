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
        /**
         * @swagger
         * tags:
         *   - name: Gallery
         *     description: Galerie photo publique
         */

        /**
         * @swagger
         * /api/gallery:
         *   get:
         *     summary: Récupérer toutes les photos de la galerie
         *     tags: [Gallery]
         *     responses:
         *       200:
         *         description: Liste des photos
         *       500:
         *         description: Erreur serveur
         */
        this.router.get('/', async (req: Request, res: Response) => {
            try {
                const photos = await this.galleryDbService.getAll();
                return res.status(StatusCodes.OK).json(photos);
            } catch (err) {
                console.error('❌ Erreur chargement galerie:', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur' });
            }
        });

        /**
         * @swagger
         * /api/gallery/event/{eventName}:
         *   get:
         *     summary: Récupérer les photos d'un événement
         *     tags: [Gallery]
         *     parameters:
         *       - in: path
         *         name: eventName
         *         required: true
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Liste des photos de l'événement
         *       500:
         *         description: Erreur serveur
         */
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

        /**
         * @swagger
         * /api/gallery/image/{filename}:
         *   get:
         *     summary: Récupérer une image de la galerie
         *     tags: [Gallery]
         *     parameters:
         *       - in: path
         *         name: filename
         *         required: true
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Image retournée
         *         content:
         *           image/*:
         *             schema:
         *               type: string
         *               format: binary
         *       500:
         *         description: Erreur lors de l'affichage de l'image
         */
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

        /**
         * @swagger
         * /api/gallery/{id}:
         *   get:
         *     summary: Récupérer une photo par son ID
         *     tags: [Gallery]
         *     parameters:
         *       - in: path
         *         name: id
         *         required: true
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Détails de la photo
         *       404:
         *         description: Photo introuvable
         */
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
