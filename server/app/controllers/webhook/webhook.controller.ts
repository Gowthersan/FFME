import { authenticateToken } from '@app/middlewares/auth.middleware';
import { TransactionDatabaseService } from '@app/services/database/transaction/transaction.database.service';
import { DonationService } from '@app/services/donation/donation.service';
import { MembershipService } from '@app/services/membership/membership.service';
import { TransactionReconciliationService } from '@app/services/transaction/transaction.reconciliation.service';
import { Request, Response, Router } from 'express';
import { Service } from 'typedi';

@Service()
export class WebhookController {
    router: Router;

    constructor(
        private readonly transactionDbService: TransactionDatabaseService,
        private readonly donationService: DonationService,
        private readonly membershipService: MembershipService,
        private readonly reconciliationService: TransactionReconciliationService,
    ) {
        this.router = Router();
        this.configureRoutes();
    }

    private configureRoutes(): void {
        /**
         * Webhook Singpay - Reçoit les notifications de paiement
         * POST /api/webhook/singpay
         *
         * Body attendu de Singpay (à adapter selon leur documentation):
         * {
         *   reference: string,       // Notre référence unique
         *   transactionId: string,   // ID Singpay
         *   status: string,          // "Disbursement", "Failed", "Pending"
         *   amount: number,
         *   result?: string,         // "Success", "TimeOutError", "Failed"
         *   paidAt?: string,
         *   payerPhone?: string,
         * }
         */
        this.router.post('/singpay', async (req: Request, res: Response) => {
            console.log('📥 Webhook Singpay reçu:', JSON.stringify(req.body, null, 2));

            try {
                const { reference, transactionId, status, result } = req.body;

                if (!reference) {
                    console.error('❌ Webhook sans référence');
                    return res.status(400).json({ success: false, message: 'Référence manquante' });
                }

                // Récupérer la transaction
                const transaction = await this.transactionDbService.getByReference(reference);

                if (!transaction) {
                    console.error(`❌ Transaction non trouvée: ${reference}`);
                    return res.status(404).json({ success: false, message: 'Transaction non trouvée' });
                }

                // Déterminer le nouveau statut
                const isSuccess = status === 'Disbursement' || (status === 'Terminate' && result !== 'TimeOutError' && result !== 'Failed');
                const isFailed = status === 'Failed' || result === 'Failed';
                const isTimeout = result === 'TimeOutError';

                let newStatus: 'completed' | 'failed' | 'timeout' | 'pending';
                if (isSuccess) {
                    newStatus = 'completed';
                } else if (isFailed) {
                    newStatus = 'failed';
                } else if (isTimeout) {
                    newStatus = 'timeout';
                } else {
                    newStatus = 'pending';
                }

                // Mettre à jour la transaction
                await this.transactionDbService.updateStatus(reference, newStatus, {
                    singpayTransactionId: transactionId,
                    singpayStatus: status,
                    singpayRawResponse: req.body,
                    webhookReceivedAt: new Date().toISOString(),
                });

                // Si le paiement est confirmé, finaliser l'entité associée
                if (newStatus === 'completed') {
                    console.log(`✅ Paiement confirmé pour ${transaction.type}: ${reference}`);

                    if (transaction.type === 'donation') {
                        await this.donationService.finalizeFromWebhook(transaction.entityId);
                    } else if (transaction.type === 'membership') {
                        await this.membershipService.finalizeFromWebhook(transaction.entityId);
                    }
                    // TODO: Ajouter le cas 'product' si nécessaire
                }

                console.log(`✅ Webhook traité: ${reference} -> ${newStatus}`);
                return res.status(200).json({ success: true, status: newStatus });
            } catch (error: any) {
                console.error('❌ Erreur traitement webhook:', error);
                return res.status(500).json({ success: false, message: error.message });
            }
        });

        /**
         * Vérification manuelle d'une transaction
         * GET /api/webhook/verify/:reference
         */
        this.router.get('/verify/:reference', async (req: Request, res: Response) => {
            const reference = req.params.reference as string;

            try {
                const transaction = await this.transactionDbService.getByReference(reference);

                if (!transaction) {
                    return res.status(404).json({ success: false, message: 'Transaction non trouvée' });
                }

                return res.status(200).json({
                    success: true,
                    transaction: {
                        id: transaction.id,
                        type: transaction.type,
                        status: transaction.status,
                        amount: transaction.amount,
                        initiatedAt: transaction.initiatedAt,
                        completedAt: transaction.completedAt,
                        singpayStatus: transaction.singpayStatus,
                    },
                });
            } catch (error: any) {
                return res.status(500).json({ success: false, message: error.message });
            }
        });

        /**
         * Liste des transactions récentes (pour debug/admin)
         * GET /api/webhook/transactions
         */
        this.router.get('/transactions', async (_req: Request, res: Response) => {
            try {
                const transactions = await this.transactionDbService.getRecentTransactions(50);
                return res.status(200).json({ success: true, transactions });
            } catch (error: any) {
                return res.status(500).json({ success: false, message: error.message });
            }
        });

        /**
         * Statistiques des transactions
         * GET /api/webhook/stats
         */
        this.router.get('/stats', async (_req: Request, res: Response) => {
            try {
                const stats = await this.transactionDbService.getStats();
                return res.status(200).json({ success: true, stats });
            } catch (error: any) {
                return res.status(500).json({ success: false, message: error.message });
            }
        });

        /**
         * Force une réconciliation manuelle des transactions en attente
         * POST /api/webhook/reconcile (protégé par authentification admin)
         */
        this.router.post('/reconcile', authenticateToken, async (_req: Request, res: Response) => {
            try {
                const result = await this.reconciliationService.forceReconciliation();
                return res.status(200).json({
                    success: true,
                    message: 'Réconciliation terminée',
                    ...result,
                });
            } catch (error: any) {
                return res.status(500).json({ success: false, message: error.message });
            }
        });
    }
}
