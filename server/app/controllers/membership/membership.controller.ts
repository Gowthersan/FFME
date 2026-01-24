import { MembershipService } from '@app/services/membership/membership.service';
import { SingPayService } from '@app/services/singpay/singpay.service';
import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import { Service } from 'typedi';

@Service()
export class MembershipController {
    router: Router;

    constructor(
        private readonly membershipService: MembershipService,
        private readonly singPayService: SingPayService,
    ) {
        this.router = Router();
        this.configureRoutes();
    }

    private configureRoutes(): void {
        const upload = multer({ dest: 'uploads/' }); // dossier temporaire

        this.router.post(
            '/',
            upload.fields([
                { name: 'cv', maxCount: 1 },
                { name: 'photo', maxCount: 1 },
                { name: 'id', maxCount: 1 },
                { name: 'formulaire', maxCount: 1 },
            ]),
            async (req, res) => {
                const rawData = req.body;
                const parsedData = {
                    ...rawData,
                    consentement: rawData.consentement === 'true',
                };

                const files = req.files as {
                    [fieldname: string]: Express.Multer.File[];
                };

                const normalizedFiles: {
                    [key: string]: {
                        path: string;
                        originalname: string;
                        mimetype: string;
                        size: number;
                    };
                } = {};

                for (const [field, fileArray] of Object.entries(files)) {
                    const file = fileArray[0]; // on prend le premier fichier par champ
                    if (file) {
                        normalizedFiles[field] = {
                            path: file.path,
                            originalname: file.originalname,
                            mimetype: file.mimetype,
                            size: file.size,
                        };
                    }
                }

                const finalData = {
                    ...parsedData,
                    fichiers: normalizedFiles,
                };

                const result = await this.membershipService.processMembership(finalData, normalizedFiles);
                if (!result.success) {
                    return res.status(400).json(result);
                }

                return res.status(201).json(result);
            },
        );

        this.router.get('/:id/exists', (req: Request, res: Response) => {
            const exists = !!this.membershipService.getMembershipById(req.params.id as string);
            return res.status(StatusCodes.OK).json({ exists });
        });

        this.router.post('/:id/payment', async (req: Request, res: Response) => {
            const { paymentMethod, montant } = req.body;
            const id = req.params.id as string;

            // Vérification du montant
            if (![15000, 20000].includes(Number(montant))) {
                return res.status(StatusCodes.BAD_REQUEST).json({
                    success: false,
                    message: 'Montant invalide. Veuillez réessayer.',
                });
            }

            try {
                const result = await this.membershipService.initiatePaymentbyMethod(id, paymentMethod, montant);

                if (!result.success) {
                    return res.status(StatusCodes.BAD_REQUEST).json(result);
                }

                return res.status(StatusCodes.OK).json(result);
            } catch (error: any) {
                console.error('Erreur serveur :', error);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message: 'Erreur serveur inattendue.',
                });
            }
        });

        this.router.get('/payment/status/:reference', async (req, res) => {
            const reference = req.params.reference;
            const don = this.membershipService.getMembershipById(reference);
            if (!don) {
                return res.status(404).json({ success: false, message: 'Adhésion introuvable' });
            }

            let result = await this.singPayService.getTransactionByReference(reference);
            if (!result.success) {
                return res.status(502).json({ success: false, message: result.message });
            }

            if (result.success) {
                // Éviter les doublons : tu peux stocker un flag genre don.confirmed = true
                // result = await this.mailService.sendConfirmationEmail('raphin.essono@sing.ga', 'Raphin', 150);
                //result = await this.mailService.sendConfirmationEmail(don.email, don.prenom, don.montant);
                console.log('wee');
            }

            return res.status(200).json({ success: true, status: result.status });
        });
    }
}
