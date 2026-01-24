import { CommentSchema } from '@app/schemas/product.schema';
import { ProductDatabaseService } from '@app/services/database/product/product.database.service';
import { ProductService } from '@app/services/product/product.service';
import { SingPayService } from '@app/services/singpay/singpay.service';
import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { Service } from 'typedi';

@Service()
export class ProductController {
    router: Router;

    constructor(
        private readonly productService: ProductService,
        private readonly productDatabaseService: ProductDatabaseService,
        private readonly singPayService: SingPayService,
    ) {
        this.router = Router();
        this.configureRoutes();
    }

    private configureRoutes(): void {
        this.router.post('/order', async (req: Request, res: Response) => {
            try {
                const result = await this.productService.validateAndStoreOrder(req.body);
                if (!result.success) {
                    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: result.message });
                }
                return res.status(StatusCodes.OK).json({ success: true, orderId: result.orderId, total: result.total });
            } catch (err) {
                console.error('❌ Erreur création commande:', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Erreur serveur' });
            }
        });

        this.router.post('/order-payment', async (req: Request, res: Response) => {
            try {
                const { orderId, montant, ...clientData } = req.body;

                const result = await this.productService.saveCommande(clientData, orderId, montant);

                if (!result.success) {
                    return res.status(400).json({ success: false, message: result.message });
                }

                return res.status(StatusCodes.OK).json({ success: true, message: result.message });
            } catch (err) {
                console.error('❌ Erreur paiement commande:', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Erreur serveur' });
            }
        });

        this.router.post('/:id/comment', async (req: Request, res: Response) => {
            try {
                const productId = req.params.id as string;

                const parseResult = CommentSchema.safeParse(req.body);
                if (!parseResult.success) {
                    return res.status(400).json({ message: 'Données invalides', errors: parseResult.error.flatten() });
                }

                const commentData = parseResult.data;

                const updated = await this.productDatabaseService.addComment(productId, commentData);
                if (!updated) return res.status(404).json({ message: 'Produit introuvable' });

                return res.status(200).json({ message: 'Commentaire ajouté avec succès' });
            } catch (error) {
                console.error('❌ Erreur lors de l’ajout du commentaire :', error);
                return res.status(500).json({ message: 'Erreur serveur' });
            }
        });

        // Récupération de tous les produits
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                const products = await this.productDatabaseService.getAllProducts();
                return res.status(StatusCodes.OK).json(products);
            } catch (err) {
                console.error('❌ [GET] Erreur récupération produits publics :', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Erreur serveur' });
            }
        });

        this.router.get('/image/:filename', async (req: Request, res: Response) => {
            try {
                const filename = decodeURIComponent(req.params.filename as string);
                const { stream, mime } = await this.productDatabaseService.streamImage(filename);
                res.setHeader('Content-Type', mime);
                res.setHeader('Content-Disposition', 'inline');
                stream.pipe(res);
            } catch (err) {
                console.error('❌ Erreur lecture image produit :', err);
                res.status(500).json({ message: 'Erreur affichage image.' });
            }
        });

        // Vérification du paiement
        this.router.get('/payment/status/:reference', async (req: Request, res: Response) => {
            try {
                const reference = req.params.reference as string;
                const commande = this.productService.getCommandeTemp(reference);

                if (!commande) {
                    return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Commande introuvable' });
                }

                const result = await this.singPayService.getTransactionByReference(reference);

                if (!result.success) {
                    return res.status(StatusCodes.BAD_GATEWAY).json({ success: false, message: result.message });
                }

                return res.status(StatusCodes.OK).json({ success: true, status: result.status });
            } catch (err) {
                console.error('❌ Erreur vérification paiement:', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Erreur serveur' });
            }
        });

        this.router.get('/:id/comments/', async (req: Request, res: Response) => {
            try {
                const productId = req.params.id as string;
                const comments = await this.productDatabaseService.getValidatedCommentsByProductId(productId);
                return res.status(200).json(comments);
            } catch (err) {
                console.error('❌ Erreur récupération des commentaires validés :', err);
                return res.status(500).json({ message: 'Erreur serveur' });
            }
        });

        this.router.get('/:id', async (req: Request, res: Response) => {
            try {
                const product = await this.productDatabaseService.getProductById(req.params.id as string);
                if (!product) {
                    return res.status(StatusCodes.NOT_FOUND).json({ message: 'Produit introuvable' });
                }
                return res.status(StatusCodes.OK).json(product);
            } catch (err) {
                console.error('❌ Erreur récupération produit:', err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Erreur serveur' });
            }
        });
    }
}
