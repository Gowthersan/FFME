import { HttpException } from '@app/classes/http.exception';
import { DateController } from '@app/controllers/date/date.controller';
import { ExampleController } from '@app/controllers/example/example.controller';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { StatusCodes } from 'http-status-codes';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Service } from 'typedi';
import { AdminController } from './controllers/admin/admin.controller';
import { AdminGalleryController } from './controllers/admin/gallery/admin.gallery.controller';
import { AdminNewsController } from './controllers/admin/news/admin.news.controller';
import { AdminProductController } from './controllers/admin/product/admin.product.controller';
import { DonationController } from './controllers/donation/donation.controller';
import { GalleryController } from './controllers/gallery/gallery.controller';
import { MembershipController } from './controllers/membership/membership.controller';
import { NewsController } from './controllers/news/news.controller';
import { ProductController } from './controllers/product/product.controller';
import { WebhookController } from './controllers/webhook/webhook.controller';

@Service()
export class Application {
    app: express.Application;
    private readonly internalError: number = StatusCodes.INTERNAL_SERVER_ERROR;
    private readonly swaggerOptions: swaggerJSDoc.Options;

    constructor(
        private readonly exampleController: ExampleController,
        private readonly dateController: DateController,
        private readonly donationController: DonationController,
        private readonly productController: ProductController,
        private readonly membershipController: MembershipController,
        private readonly galleryController: GalleryController,
        private readonly newsController: NewsController,
        private readonly webhookController: WebhookController,

        private readonly adminController: AdminController,
        private readonly adminProductController: AdminProductController,
        private readonly adminGalleryController: AdminGalleryController,
        private readonly adminNewsController: AdminNewsController,
    ) {
        this.app = express();

        this.swaggerOptions = {
            swaggerDefinition: {
                openapi: '3.0.0',
                info: {
                    title: 'API Fondation François Meye',
                    version: '1.0.0',
                    description: 'API REST pour la gestion des dons, adhésions, produits, actualités et galerie photo de la Fondation François Meye.',
                },
                servers: [
                    {
                        url: '/api',
                        description: 'Serveur API',
                    },
                ],
                components: {
                    securitySchemes: {
                        bearerAuth: {
                            type: 'http',
                            scheme: 'bearer',
                            bearerFormat: 'JWT',
                            description: 'Token JWT obtenu via /api/admin/login',
                        },
                    },
                },
            },
            apis: ['**/*.ts'],
        };

        this.config();

        this.bindRoutes();
    }

    bindRoutes(): void {
        // Health check endpoint for Docker/Kubernetes
        this.app.get('/api/health', (req, res) => {
            res.status(StatusCodes.OK).json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerJSDoc(this.swaggerOptions)));
        this.app.use('/api/donation', this.donationController.router);
        this.app.use('/api/example', this.exampleController.router);
        this.app.use('/api/product', this.productController.router);
        this.app.use('/api/membership', this.membershipController.router);
        this.app.use('/api/gallery', this.galleryController.router);
        this.app.use('/api/news', this.newsController.router);
        this.app.use('/api/date', this.dateController.router);

        this.app.use('/api/webhook', this.webhookController.router);

        this.app.use('/api/admin', this.adminController.router);
        this.app.use('/api/admin/gallery', this.adminGalleryController.router);
        this.app.use('/api/admin/news', this.adminNewsController.router);
        this.app.use('/api/admin/product', this.adminProductController.router);
        this.app.use('/', (req, res) => {
            res.redirect('/api/docs');
        });
        this.errorHandling();
    }

    private config(): void {
        // Middlewares configuration

        // Origines autorisées (toujours)
        const allowedOrigins: string[] = [
            // Production
            'https://fondationfrancoismeye.ga',
            'https://www.fondationfrancoismeye.ga',
            'https://api.fondationfrancoismeye.ga',
            // Localhost (dev local ou Docker local) - TOUJOURS autorisé
            'http://localhost',
            'http://localhost:80',
            'http://localhost:3000',
            'http://localhost:4200',
            'http://localhost:5000',
            'http://127.0.0.1',
            'http://127.0.0.1:80',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:4200',
            'http://127.0.0.1:5000',
            // Docker internal networking
            'http://client',
            'http://client:80',
        ];

        // Ajouter CLIENT_URL si défini dans l'environnement
        if (process.env.CLIENT_URL) {
            allowedOrigins.push(process.env.CLIENT_URL.replace(/\/$/, ''));
        }

        // CORS avec fonction dynamique pour supporter toutes les origines localhost
        this.app.use(
            cors({
                origin: (origin, callback) => {
                    // Autoriser les requêtes sans origine (curl, Postman, etc.)
                    if (!origin) return callback(null, true);

                    // Autoriser toutes les origines localhost/127.0.0.1
                    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
                        return callback(null, true);
                    }

                    // Vérifier dans la liste des origines autorisées
                    if (allowedOrigins.includes(origin)) {
                        return callback(null, true);
                    }

                    // Bloquer les autres origines
                    callback(new Error(`CORS: Origin ${origin} not allowed`));
                },
                credentials: true,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            }),
        );


        this.app.use(cookieParser());

        // Augmenter les limites pour les uploads (fichiers en base64)
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    }

    private errorHandling(): void {
        // When previous handlers have not served a request: path wasn't found
        this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            const err: HttpException = new HttpException('Not Found');
            next(err);
        });

        // development error handler
        // will print stacktrace
        if (this.app.get('env') === 'development') {
            this.app.use((err: HttpException, req: express.Request, res: express.Response) => {
                res.status(err.status || this.internalError);
                res.send({
                    message: err.message,
                    error: err,
                });
            });
        }

        // production error handler
        // no stacktraces  leaked to user (in production env only)
        this.app.use((err: HttpException, req: express.Request, res: express.Response) => {
            res.status(err.status || this.internalError);
            res.send({
                message: err.message,
                error: {},
            });
        });
    }
}
