import { authenticateToken } from '@app/middlewares/auth.middleware';
import { connectionLimiter } from '@app/middlewares/connectionLimiter.middleware';
import { imageRateLimiter } from '@app/middlewares/imageRateLimiter.middleware';
import { GalleryDatabaseFtpService } from '@app/services/database/gallery/gallery.database.ftp.service';
import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import { Service } from 'typedi';

@Service()
export class AdminGalleryController {
    public router: Router;

    constructor(private readonly galleryDbService: GalleryDatabaseFtpService) {
        this.router = Router();
        this.configureRoutes();
    }

    private configureRoutes(): void {
        const upload = multer(); // Utilisation de mémoire, pas de stockage sur disque

        this.router.get('/', async (req: Request, res: Response) => {
            try {
                const photos = await this.galleryDbService.getAll();
                return res.status(StatusCodes.OK).json(photos);
            } catch (err) {
                console.error('[GET] Erreur chargement galerie:', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Erreur serveur.' });
            }
        });

        // Image - DOIT être avant /:id pour éviter que "image" soit interprété comme un ID
        this.router.get('/image/:filename', imageRateLimiter, connectionLimiter, async (req: Request, res: Response) => {
            const filename = req.params.filename as string;

            try {
                const { stream, mime } = await this.galleryDbService.streamImage(decodeURIComponent(filename));
                res.setHeader('Content-Type', mime);
                res.setHeader('Content-Disposition', 'inline');
                stream.pipe(res);
            } catch (err) {
                console.error('❌ Erreur streaming image depuis FTP :', err);
                res.status(500).json({ message: "Erreur lors de l'affichage de l'image." });
            }
        });

        this.router.get('/:id', async (req: Request, res: Response) => {
            const id = req.params.id as string;
            const photo = await this.galleryDbService.getById(id);
            if (!photo) {
                return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Photo introuvable' });
            }
            return res.status(StatusCodes.OK).json(photo);
        });

        // ➕ Upload de nouvelles photos (multiple)
        this.router.post('/', upload.array('images', 20), authenticateToken, async (req: Request, res: Response) => {
            const { eventName, description } = req.body;
            const files = req.files as Express.Multer.File[];

            if (!files || files.length === 0 || !eventName || !description) {
                return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Champs requis manquants.' });
            }

            try {
                const savedPhotos = await this.galleryDbService.uploadPhotos(files, eventName, description);
                return res.status(StatusCodes.CREATED).json(savedPhotos);
            } catch (err) {
                console.error('[POST] Erreur upload FTP :', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Erreur serveur.' });
            }
        });

        // ✏️ Modification d'une photo
        this.router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
            const id = req.params.id as string;
            const { eventName, description } = req.body;

            if (!eventName || !description) {
                return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Champs requis manquants.' });
            }

            try {
                const updated = await this.galleryDbService.updatePhoto(id, eventName, description);
                if (!updated) {
                    return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Photo non trouvée.' });
                }
                return res.status(StatusCodes.OK).json(updated);
            } catch (err) {
                console.error('❌ [PUT] Erreur modification FTP :', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Erreur serveur.' });
            }
        });

        // 🗑 Suppression d'une photo
        this.router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
            const id = req.params.id as string;

            try {
                const deleted = await this.galleryDbService.deletePhoto(id);
                if (!deleted) {
                    return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Photo introuvable' });
                }
                return res.status(StatusCodes.OK).json({ success: true, message: 'Photo supprimée avec succès' });
            } catch (err) {
                console.error('❌ [DELETE] Erreur suppression FTP :', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Erreur serveur' });
            }
        });
    }
}
