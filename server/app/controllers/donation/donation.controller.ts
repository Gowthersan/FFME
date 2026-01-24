import { DonationService } from '@app/services/donation/donation.service';
import { SingPayService } from '@app/services/singpay/singpay.service';
import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { Service } from 'typedi';

@Service()
export class DonationController {
    router: Router;

    constructor(
        private readonly donationService: DonationService,
        private readonly singPayService: SingPayService,
        //private readonly mailService: MailService,
    ) {
        this.configureRouter();
    }

    private configureRouter(): void {
        this.router = Router();

        this.router.post('/', (req: Request, res: Response) => {
            const result = this.donationService.processDonation(req.body);

            if (!result.success) {
                return res.status(StatusCodes.BAD_REQUEST).json(result);
            }
            return res.status(StatusCodes.CREATED).json(result);
        });

        this.router.post('/:id/singpay', async (req: Request, res: Response) => {
            const donId = req.params.id as string;
            const don = this.donationService.getDonationById(donId);
            if (!don) {
                return res.status(404).json({ success: false, message: 'Don introuvable ou expiré' });
            }

            const result = await this.donationService.saveDonationWithSingPay(donId);
            if (!result.success) {
                return res.status(500).json({ success: false, message: result.message });
            }

            return res.status(200).json({ success: true, message: result.message });
        });

        this.router.post('/:id/payment-others', async (req: Request, res: Response) => {
            const donId = req.params.id as string;
            const result = await this.donationService.saveDonationWithRIB(donId);

            console.log('recu');

            if (!result.success) {
                return res.status(404).json({ success: false, message: result.message });
            }

            return res.status(200).json({ success: true, message: result.message });
        });

        this.router.get('/:id/exists', (req: Request, res: Response) => {
            const exists = !!this.donationService.getDonationById(req.params.id as string);

            return res.status(StatusCodes.OK).json({ exists });
        });

        this.router.get('/payment/status/:reference', async (req, res) => {
            const reference = req.params.reference;
            //const referenceTest = '3aef1481-ee96-4588-beea-a5e69ae2da46';
            const don = this.donationService.getDonationById(reference);
            if (!don) {
                return res.status(404).json({ success: false, message: 'Don introuvable' });
            }

            let result = await this.singPayService.getTransactionByReference(reference);
            if (!result.success) {
                return res.status(502).json({ success: false, message: result.message });
            }

            if (result.success) {
                // Éviter les doublons : tu peux stocker un flag genre don.confirmed = true
                // result = await this.mailService.sendConfirmationEmail('raphin.essono@sing.ga', 'Raphin', 150);
                //result = await this.mailService.sendConfirmationEmail(don.email, don.prenom, don.montant);
            }

            return res.status(200).json({ success: true, status: result.status });
        });
    }
}
