import { authenticateToken } from '@app/middlewares/auth.middleware';
import { connectionLimiter } from '@app/middlewares/connectionLimiter.middleware';
import { imageRateLimiter } from '@app/middlewares/imageRateLimiter.middleware';
import { NewsDatabaseFtpService } from '@app/services/database/news/news.database.ftp.service';
import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import { Service } from 'typedi';

@Service()
export class AdminNewsController {
    public router: Router;

    constructor(private readonly newsDbService: NewsDatabaseFtpService) {
        this.router = Router();
        this.configureRoutes();
    }

    private configureRoutes(): void {
        const upload = multer();

        this.router.get('/', async (_req: Request, res: Response) => {
            const newsList = await this.newsDbService.getAll();
            return res.status(StatusCodes.OK).json(newsList);
        });

        // Image - DOIT être avant /:id pour éviter que "image" soit interprété comme un ID
        this.router.get('/image/:filename', imageRateLimiter, connectionLimiter, async (req: Request, res: Response) => {
            try {
                const { stream, mime } = await this.newsDbService.streamImage(decodeURIComponent(req.params.filename as string));
                res.setHeader('Content-Type', mime);
                res.setHeader('Content-Disposition', 'inline');
                stream.pipe(res);
            } catch (err) {
                console.error('❌ Erreur lecture image :', err);
                res.status(500).json({ message: 'Erreur affichage image.' });
            }
        });

        this.router.get('/:id', async (req: Request, res: Response) => {
            const news = await this.newsDbService.getById(req.params.id as string);
            if (!news) {
                return res.status(StatusCodes.NOT_FOUND).json({ message: 'Actualité introuvable' });
            }
            return res.status(StatusCodes.OK).json(news);
        });

        this.router.post('/', upload.single('image'), authenticateToken, async (req: Request, res: Response) => {
            const { title, description, date, externalLink } = req.body;
            const file = req.file;

            if (!file || !title || !description || !date) {
                return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Champs requis manquants.' });
            }

            try {
                const saved = await this.newsDbService.uploadNews(file, title, description, date, externalLink);
                return res.status(StatusCodes.CREATED).json(saved);
            } catch (err) {
                console.error('❌ [POST] Erreur upload news :', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur.' });
            }
        });

        this.router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
            const { title, description, date, externalLink } = req.body;
            if (!title || !description || !date) {
                return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Champs requis manquants.' });
            }

            try {
                const updated = await this.newsDbService.updateNews(req.params.id as string, title, description, date, externalLink);
                if (!updated) {
                    return res.status(StatusCodes.NOT_FOUND).json({ message: 'Actualité non trouvée.' });
                }
                return res.status(StatusCodes.OK).json(updated);
            } catch (err) {
                console.error('❌ [PUT] Erreur update news :', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur.' });
            }
        });

        this.router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
            try {
                const deleted = await this.newsDbService.deleteNews(req.params.id as string);
                if (!deleted) {
                    return res.status(StatusCodes.NOT_FOUND).json({ message: 'Actualité non trouvée' });
                }
                return res.status(StatusCodes.OK).json({ success: true, message: 'Actualité supprimée.' });
            } catch (err) {
                console.error('❌ [DELETE] Erreur suppression news :', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur.' });
            }
        });
    }
}
