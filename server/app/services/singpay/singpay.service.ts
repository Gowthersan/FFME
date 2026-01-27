import { HOST, singPayConfig } from '@app/env';
import axios from 'axios';
import { Service } from 'typedi';

export type PaymentType = 'membership' | 'donation' | 'product';

@Service()
export class SingPayService {
    private readonly apiUrl = singPayConfig.apiUrl;
    private readonly transactionsUrl = singPayConfig.transactionsUrl;

    /**
     * Génère une URL de paiement vers le portail Singpay (mode gateway)
     * L'utilisateur est redirigé vers Singpay pour payer
     */
    async initiatePayment(
        reference: string,
        montant: number,
        type: PaymentType = 'membership',
    ): Promise<{ success: boolean; link?: string; message?: string }> {
        // Définir les URLs de redirection selon le type de paiement
        const redirectUrls = {
            membership: {
                success: `${HOST.clientUrl}succes-adhesion/${reference}`,
                error: `${HOST.clientUrl}echec-adhesion/${reference}`,
            },
            donation: {
                success: `${HOST.clientUrl}succes-don/${reference}`,
                error: `${HOST.clientUrl}echec-don/${reference}`,
            },
            product: {
                success: `${HOST.clientUrl}succes-commande/${reference}`,
                error: `${HOST.clientUrl}echec-commande/${reference}`,
            },
        };

        const payload = {
            portefeuille: singPayConfig.walletId,
            reference: reference,
            redirect_success: redirectUrls[type].success,
            redirect_error: redirectUrls[type].error,
            amount: montant,
            disbursement: singPayConfig.disbursementId,
            isTransfer: false,
        };

        const headers = {
            accept: '*/*',
            'x-client-id': singPayConfig.clientId,
            'x-client-secret': singPayConfig.clientSecret,
            'x-wallet': singPayConfig.walletId,
            'Content-Type': 'application/json',
        };

        console.log('📤 Envoi à SING Pay Gateway :', {
            url: this.apiUrl,
            body: payload,
        });

        try {
            const response = await axios.post(this.apiUrl, payload, { headers });
            console.log('✅ Réponse SING Pay :', response.data);

            if (!response.data?.link) {
                console.error('❌ Aucun lien de paiement reçu:', response.data);
                return { success: false, message: 'Aucun lien de paiement reçu de SING Pay.' };
            }

            return { success: true, link: response.data.link };
        } catch (error: any) {
            const message = error.response?.data?.message || error.message || 'Erreur inconnue';
            console.error('❌ Erreur SING Pay:', message);
            if (error.response) {
                console.error("Détails de l'erreur:", error.response.data);
            }
            return { success: false, message };
        }
    }

    /**
     * Récupère une transaction par référence pour vérifier son statut
     */
    async getTransactionByReference(
        reference: string,
    ): Promise<{ success: boolean; status?: string; raw?: any; message?: string }> {
        const url = `${this.transactionsUrl}/search/by-reference/${encodeURIComponent(reference)}`;

        const headers = {
            accept: '*/*',
            'x-client-id': singPayConfig.clientId,
            'x-client-secret': singPayConfig.clientSecret,
            'x-wallet': singPayConfig.walletId,
        };

        try {
            const response = await axios.get(url, { headers });
            console.log('✅ Transaction récupérée pour référence:', reference);

            return {
                success: true,
                status: response.data?.status || 'inconnu',
                raw: response.data,
            };
        } catch (error: any) {
            const message = error.response?.data?.message || error.message || 'Erreur inconnue';
            console.error('❌ Erreur recherche par référence:', message);
            return {
                success: false,
                message,
            };
        }
    }
}
