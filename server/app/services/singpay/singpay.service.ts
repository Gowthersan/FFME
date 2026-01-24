import { HOST, singPayConfig } from '@app/env';
import axios from 'axios';
import { Service } from 'typedi';

@Service()
export class SingPayService {
    private readonly apiUrl = 'https://gateway.singpay.ga/v1';

    async initiatePayment(reference: string, montant: number): Promise<{ success: boolean; link?: string; message?: string }> {
        const payload = {
            portefeuille: singPayConfig.walletId,
            reference: reference,
            redirect_success: `${HOST.serverUrl}succes/${reference}`,
            redirect_error: `${HOST.serverUrl}echec/${reference}`,
            amount: montant,
            disbursement: singPayConfig.disbursementId,
            logURL: 'https://tonsite.com/log',
            isTransfer: false,
        };

        const headers = {
            'x-client-id': singPayConfig.clientId,
            'x-client-secret': singPayConfig.clientSecret,
            'x-wallet': singPayConfig.walletId,
            'Content-Type': 'application/json',
        };

        console.log('📤 Envoi à SING Pay :', {
            url: this.apiUrl,
            headers,
            body: payload,
        });

        try {
            const response = await axios.post(`${this.apiUrl}/74/paiement`, payload, { headers });
            console.log('✅ Réponse SING Pay :', response.data);

            if (!response.data?.link) {
                return { success: false, message: 'Lien de paiement introuvable dans la réponse.' };
            }

            return { success: true, link: response.data.link };
        } catch (error: any) {
            const message = error.response?.data?.message || error.message || 'Erreur inconnue';
            console.error('❌ Erreur SING Pay:', message);
            return { success: false, message };
        }
    }

    async initiateSimple(
        reference: string,
        montant: number,
        numero: string,
    ): Promise<{
        success: boolean;
        reference?: string;
        status?: string;
        result?: string;
        message?: string;
    }> {
        const payload = {
            portefeuille: singPayConfig.walletId,
            reference: reference,
            amount: montant,
            client_msisdn: numero,
            disbursement: singPayConfig.disbursementId,
            isTransfer: false,
        };

        const headers = {
            'x-client-id': singPayConfig.clientId,
            'x-client-secret': singPayConfig.clientSecret,
            'x-wallet': singPayConfig.walletId,
            'Content-Type': 'application/json',
        };

        console.log('📤 Envoi à SING Pay :', {
            url: this.apiUrl,
            headers,
            body: payload,
        });

        try {
            const response = await axios.post(`${this.apiUrl}/74/paiement`, payload, { headers });
            console.log('Réponse : ', response);
            const transaction = response.data?.transaction;
            const success = response.data?.status?.success;

            if (!success) {
                return {
                    success: false,
                    message: 'Échec de la transaction ou référence manquante.',
                };
            }

            return {
                success: true,
                reference: transaction.reference,
                status: transaction.status,
                result: transaction.result,
            };
        } catch (error: any) {
            const message = error.response?.data?.message || error.message || 'Erreur inconnue';
            console.error('❌ Erreur SING Pay (initiateSimple) :', message);
            return {
                success: false,
                message,
            };
        }
    }

    async getTransactionByReference(reference: string): Promise<{ success: boolean; status?: string; raw?: any; message?: string }> {
        const url = `https://gateway.singpay.ga/v1/transaction/api/search/by-reference/${reference}`;

        const headers = {
            'x-client-id': singPayConfig.clientId,
            'x-client-secret': singPayConfig.clientSecret,
            'x-wallet': singPayConfig.walletId,
        };

        try {
            const response = await axios.get(url, { headers });

            console.log('✅ Réponse transaction par référence ');

            return {
                success: true,
                status: response.data?.status || 'inconnu',
                raw: response.data,
            };
        } catch (error: any) {
            const message = error.response?.data?.message || error.message || 'Erreur inconnue';
            console.error('❌ Erreur recherche par référence :', message);
            return {
                success: false,
                message,
            };
        }
    }
}
