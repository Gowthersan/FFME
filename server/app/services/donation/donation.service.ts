import { DonationData, DonationSchema } from '@app/schemas/donation.schema';
import * as mailType from '@app/utils/generate.email';
import { PaymentMethod } from '@common/enums/payment-method';
import { PaymentStatus } from '@common/enums/payment-status';
import { Donation } from '@common/interfaces/donation';
import * as crypto from 'crypto';
import { setTimeout as delay } from 'timers/promises'; // utile pour faire une pause
import { Service } from 'typedi';
import { DonationDatabaseService } from '../database/donation/donation.database.service';
import { MailService } from '../mail/mail.service';
import { SingPayService } from '../singpay/singpay.service';

@Service()
export class DonationService {
    private readonly storedDonations: Map<string, DonationData> = new Map();
    private readonly timeouts: Map<string, NodeJS.Timeout> = new Map(); // Pour stocker les timeouts

    //private readonly EXPIRATION_MS = 2 * 60 * 1000; // 2 minutes

    constructor(
        private readonly donationDatabaseService: DonationDatabaseService,
        private readonly singPayService: SingPayService,
        private readonly mailService: MailService,
    ) {}

    processDonation(data: unknown): { success: boolean; message: string; donId?: string } {
        const parsed = DonationSchema.safeParse(data);

        if (!parsed.success) {
            const message = parsed.error.issues.map((e) => e.message).join(', ');
            return { success: false, message };
        }

        const cleanData: DonationData = parsed.data;
        const donId = crypto.randomUUID();

        // Enregistrement dans la Map
        this.storedDonations.set(donId, cleanData);

        console.log(`Don stocké avec ID temporaire ${donId}`);

        return {
            success: true,
            message: 'Don enregistré avec succès',
            donId,
        };
    }

    getDonationById(id: string): DonationData | undefined {
        return this.storedDonations.get(id);
    }

    async saveDonationWithSingPay(donId: string): Promise<{ success: boolean; message: string }> {
        const don = this.storedDonations.get(donId);
        if (!don) return { success: false, message: 'Don introuvable' };

        const payment = await this.singPayService.initiateSimple(donId, 110, '074136289');
        if (!payment.success) {
            return { success: false, message: payment.message };
        }

        let statusOk = false;
        let maxAttempts = 9; // ⏳ max 1 minute (9 * 10s)
        let resultMessage = '';

        while (maxAttempts > 0) {
            console.log(`⏳ Vérification paiement [tentative ${10 - maxAttempts}/9]`);
            const tx = await this.singPayService.getTransactionByReference(donId);

            if (tx.success) {
                const status = tx.status;
                const result = tx.raw?.result;

                if (status === 'Disbursement' || (status === 'Terminate' && result !== 'TimeOutError')) {
                    statusOk = true;
                    break;
                }

                if (status === 'Terminate' && result === 'TimeOutError') {
                    resultMessage = 'Le paiement a expiré (TimeOutError).';
                    break;
                }
            }

            maxAttempts--;
            await delay(10000); // ⏱ pause de 10 secondes
        }

        if (statusOk) {
            // ✅ Paiement confirmé : à ce moment tu peux enregistrer définitivement dans Mongo
            //this.commandesTemp.delete(orderId);

            const donation: Donation = {
                idDonation: donId,
                projectMotivation: don.motif ?? '', // ou 'Projet de soutien'
                firstName: don.prenom ?? '',
                lastName: don.nom ?? '',
                phone: don.numero ?? '',
                email: don.email,
                amount: don.montant,
                paymentMethod: PaymentMethod.SING_PAY,
                isPaid: PaymentStatus.COMPLETED,
                registrationDate: new Date().toISOString(),
            };

            await this.donationDatabaseService.create(donation);
            this.storedDonations.delete(donId);
            const html = mailType.generateConfirmedDonationEmail(don.prenom, don.nom, don.montant, don.numero);

            await this.mailService.sendMail(don.email, 'Confirmation de don', html);

            return { success: true, message: 'Paiement confirmé, don enregistrée.' };
        }

        this.storedDonations.delete(donId);
        return { success: false, message: resultMessage || 'Paiement non confirmé dans le temps imparti.' };
    }

    async saveDonationWithRIB(donId: string): Promise<{ success: boolean; message: string }> {
        const don = this.storedDonations.get(donId);
        if (!don) return { success: false, message: 'Don introuvable' };

        const donation: Donation = {
            idDonation: donId,
            projectMotivation: don.motif ?? '', // ou 'Projet de soutien'
            firstName: don.prenom ?? '',
            lastName: don.nom ?? '',
            phone: don.numero ?? '',
            email: don.email,
            amount: don.montant,
            paymentMethod: PaymentMethod.RIB,
            isPaid: PaymentStatus.PENDING,
            registrationDate: new Date().toISOString(),
        };

        await this.donationDatabaseService.create(donation);
        this.storedDonations.delete(donId);
        const html = mailType.generatePendingDonationEmail(don.prenom, don.montant);

        await this.mailService.sendMail(don.email, 'Confirmation de don', html);

        return { success: true, message: 'Don enregistré avec succès en attente de virement' };
    }

    // Facultatif : supprimer manuellement un don (ex. après paiement confirmé)
    deleteDonation(id: string): boolean {
        const deleted = this.storedDonations.delete(id);
        const timeout = this.timeouts.get(id);
        if (timeout) clearTimeout(timeout);
        this.timeouts.delete(id);
        return deleted;
    }
}
