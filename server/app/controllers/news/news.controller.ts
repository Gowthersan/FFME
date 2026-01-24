// controllers/public/news.controller.ts
import { connectionLimiter } from '@app/middlewares/connectionLimiter.middleware';
import { imageRateLimiter } from '@app/middlewares/imageRateLimiter.middleware';
import { NewsDatabaseFtpService } from '@app/services/database/news/news.database.ftp.service';
import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { Service } from 'typedi';

@Service()
export class NewsController {
    public router: Router;

    constructor(private readonly newsDbService: NewsDatabaseFtpService) {
        this.router = Router();
        this.configureRoutes();
    }

    private configureRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                const newsList = await this.newsDbService.getAll();
                return res.status(StatusCodes.OK).json(newsList);
            } catch (err) {
                console.error('❌ Erreur chargement actualités:', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur' });
            }
        });

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
            try {
                const news = await this.newsDbService.getById(req.params.id as string);
                if (!news) {
                    return res.status(StatusCodes.NOT_FOUND).json({ message: 'Actualité introuvable' });
                }
                return res.status(StatusCodes.OK).json(news);
            } catch (err) {
                console.error('❌ Erreur récupération actualité:', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur' });
            }
        });
    }
}
