import { authenticateToken } from '@app/middlewares/auth.middleware';
import { connectionLimiter } from '@app/middlewares/connectionLimiter.middleware';
import { imageRateLimiter } from '@app/middlewares/imageRateLimiter.middleware';
import { ProductDatabaseService } from '@app/services/database/product/product.database.service';
import { Product } from '@common/interfaces/product';
import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import { Service } from 'typedi';

function safeJsonParse<T>(jsonString: string, fallback: T): T {
    try {
        return JSON.parse(jsonString) as T;
    } catch {
        return fallback;
    }
}

@Service()
export class AdminProductController {
    public router: Router;

    constructor(private readonly productDbService: ProductDatabaseService) {
        this.router = Router();
        this.configureRoutes();
    }

    private configureRoutes(): void {
        const upload = multer();
        // Commandes
        this.router.get('/orders', authenticateToken, async (_req: Request, res: Response) => {
            const orders = await this.productDbService.getAllOrders();
            return res.status(StatusCodes.OK).json(orders);
        });

        this.router.get('/order/:id', authenticateToken, async (req: Request, res: Response) => {
            const order = await this.productDbService.getOrderById(req.params.id as string);
            if (!order) {
                return res.status(StatusCodes.NOT_FOUND).json({ message: 'Commande introuvable' });
            }
            return res.status(StatusCodes.OK).json(order);
        });

        this.router.patch('/order/:id/status', authenticateToken, async (req: Request, res: Response) => {
            const { newStatus } = req.body;

            try {
                const updated = await this.productDbService.updateOrderStatus(req.params.id as string, newStatus);
                if (!updated) {
                    return res.status(StatusCodes.NOT_FOUND).json({ message: 'Commande introuvable' });
                }
                return res.status(StatusCodes.OK).json(updated);
            } catch (err) {
                console.error('❌ [PATCH] Erreur update statut commande :', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur.' });
            }
        });

        // Produits
        this.router.get('/', authenticateToken, async (_req: Request, res: Response) => {
            const products = await this.productDbService.getAllProducts();
            return res.status(StatusCodes.OK).json(products);
        });

        // Image - DOIT être avant /:id pour éviter que "image" soit interprété comme un ID
        this.router.get('/image/:filename', imageRateLimiter, connectionLimiter, async (req: Request, res: Response) => {
            try {
                const { stream, mime } = await this.productDbService.streamImage(decodeURIComponent(req.params.filename as string));
                res.setHeader('Content-Type', mime);
                res.setHeader('Content-Disposition', 'inline');
                stream.pipe(res);
            } catch (err) {
                console.error('❌ Erreur lecture image produit :', err);
                res.status(500).json({ message: 'Erreur affichage image.' });
            }
        });

        this.router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
            const product = await this.productDbService.getProductById(req.params.id as string);
            if (!product) {
                return res.status(StatusCodes.NOT_FOUND).json({ message: 'Produit introuvable' });
            }
            return res.status(StatusCodes.OK).json(product);
        });

        this.router.post('/', upload.single('image'), authenticateToken, async (req: Request, res: Response) => {
            const { title, description, about, type, stock, versions, extraLink } = req.body;
            const file = req.file;

            if (!file || !title || !description || !about || !type || !versions || !stock) {
                return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Champs requis manquants.' });
            }

            try {
                const parsedAbout = safeJsonParse<string[]>(about, []);
                const parsedVersions = safeJsonParse<any[]>(versions, []);
                const parsedExtraLink = extraLink ? safeJsonParse<{ label: string; url: string }>(extraLink, { label: '', url: '' }) : undefined;

                if (parsedAbout.length === 0 || parsedVersions.length === 0) {
                    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Format JSON invalide pour about ou versions.' });
                }

                const productToSave: Product = {
                    title,
                    description,
                    about: parsedAbout,
                    type,
                    stock: Number(stock),
                    versions: parsedVersions,
                    extraLink: parsedExtraLink,
                    image: '',
                    averageReview: 0,
                    comments: [],
                };

                const saved = await this.productDbService.createProduct(file, productToSave);
                return res.status(StatusCodes.CREATED).json(saved);
            } catch (err) {
                console.error('Erreur création produit :', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur.' });
            }
        });

        this.router.put('/:id', upload.none(), authenticateToken, async (req: Request, res: Response) => {
            const { title, description, about, type, stock, versions, extraLink } = req.body;

            if (!title || !description || !about || !type || !versions || !stock) {
                return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Champs requis manquants.' });
            }

            try {
                const parsedAbout = safeJsonParse<string[]>(about, []);
                const parsedVersions = safeJsonParse<any[]>(versions, []);
                const parsedExtraLink = extraLink ? safeJsonParse<{ label: string; url: string }>(extraLink, { label: '', url: '' }) : undefined;

                if (parsedAbout.length === 0 || parsedVersions.length === 0) {
                    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Format JSON invalide pour about ou versions.' });
                }

                const updated = await this.productDbService.updateProduct(req.params.id as string, {
                    title,
                    description,
                    about: parsedAbout,
                    type,
                    stock: Number(stock),
                    versions: parsedVersions,
                    extraLink: parsedExtraLink,
                });

                return res.status(StatusCodes.OK).json(updated);
            } catch (err) {
                console.error('Erreur update produit :', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur.' });
            }
        });

        this.router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
            try {
                const deleted = await this.productDbService.deleteProduct(req.params.id as string);
                if (!deleted) {
                    return res.status(StatusCodes.NOT_FOUND).json({ message: 'Produit non trouvé' });
                }
                return res.status(StatusCodes.OK).json({ success: true, message: 'Produit supprimé.' });
            } catch (err) {
                console.error('❌ [DELETE] Erreur suppression produit :', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur.' });
            }
        });

        this.router.patch('/:productId/comment/:commentId', authenticateToken, async (req: Request, res: Response) => {
            const { action } = req.body;
            if (!['validate', 'delete'].includes(action)) {
                return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Action invalide.' });
            }

            try {
                const updated = await this.productDbService.patchProductComment(req.params.productId as string, req.params.commentId as string, action);
                return res.status(StatusCodes.OK).json(updated);
            } catch (err) {
                console.error('❌ [PATCH] Erreur patch commentaire produit :', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur.' });
            }
        });
    }
}
