import { ProductCommandeSchema } from '@app/schemas/product.schema';
import * as mailType from '@app/utils/generate.email';
import { PaymentMethod } from '@common/enums/payment-method';
import { PaymentStatus } from '@common/enums/payment-status';
import { Product } from '@common/interfaces/product';
import { ProductOrder } from '@common/interfaces/product-order';
import * as crypto from 'crypto';
import { Service } from 'typedi';
import { ProductDatabaseService } from '../database/product/product.database.service';
import { MailService } from '../mail/mail.service';
import { SingPayService } from '../singpay/singpay.service';

type CommandeTemp = {
    montant: number;
    items: Product[];
    clientData?: any;
};

@Service()
export class ProductService {
    private commandesTemp: Map<string, CommandeTemp> = new Map();

    constructor(
        private readonly productDatabaseService: ProductDatabaseService,
        private readonly mailService: MailService,
        private readonly singPayService: SingPayService,
    ) {}

    getCommandeTemp(orderId: string): CommandeTemp | undefined {
        return this.commandesTemp.get(orderId);
    }

    async validateAndStoreOrder(commande: {
        items: {
            _id: string;
            versionLabel: string;
            price: number;
            quantity: number;
        }[];
    }): Promise<{ success: boolean; message?: string; orderId?: string; total?: number }> {
        let total = 0;
        const produits: Product[] = [];

        for (const item of commande.items) {
            const product = await this.productDatabaseService.getProductById(item._id);
            if (!product) return { success: false, message: `Produit ${item._id} introuvable` };

            const version = product.versions.find((v) => v.label === item.versionLabel);
            if (!version || version.price !== item.price) {
                return { success: false, message: `Produit ou version incorrecte pour ${product.title}` };
            }

            total += version.price * item.quantity;
            produits.push(product);
        }

        const orderId = crypto.randomUUID();
        this.commandesTemp.set(orderId, { montant: total, items: produits });

        return { success: true, orderId, total };
    }

    /**
     * Stocke les données client et initie le paiement Singpay
     */
    async initiatePayment(
        clientData: any,
        orderId: string,
        montant: number,
    ): Promise<{ success: boolean; message: string; link?: string }> {
        clientData.montant = montant;
        const parsed = ProductCommandeSchema.safeParse(clientData);
        if (!parsed.success) {
            console.error('Erreur de validation côté backend :', parsed.error.flatten());
            const message = parsed.error.issues.map((e) => e.message).join(', ');
            return { success: false, message };
        }

        const temp = this.commandesTemp.get(orderId);
        if (!temp) {
            return { success: false, message: 'Commande expirée ou introuvable.' };
        }

        if (temp.montant !== Number(montant)) {
            return { success: false, message: 'Montant incorrect.' };
        }

        // Stocker les données client pour la finalisation
        temp.clientData = parsed.data;

        // Initier le paiement avec redirection vers le portail Singpay
        const payment = await this.singPayService.initiatePayment(orderId, montant, 'product');
        if (!payment.success || !payment.link) {
            return { success: false, message: payment.message || 'Erreur lors de l\'initiation du paiement' };
        }

        return { success: true, message: 'Redirection vers Sing Pay...', link: payment.link };
    }

    /**
     * Vérifie le paiement et finalise la commande si confirmé
     */
    async verifyAndFinalizeOrder(orderId: string): Promise<{ success: boolean; message: string }> {
        const temp = this.commandesTemp.get(orderId);
        if (!temp || !temp.clientData) {
            return { success: false, message: 'Commande introuvable ou déjà traitée.' };
        }

        // Vérifier le statut du paiement auprès de Singpay
        const tx = await this.singPayService.getTransactionByReference(orderId);

        if (!tx.success) {
            return { success: false, message: tx.message || 'Erreur lors de la vérification du paiement' };
        }

        const status = tx.status;
        const result = tx.raw?.result;

        // Vérifier si le paiement est confirmé
        if (status === 'Disbursement' || (status === 'Terminate' && result !== 'TimeOutError')) {
            // ✅ Paiement confirmé : enregistrer la commande
            const finalCommande: ProductOrder = {
                _id: '',
                idOrder: orderId,
                firstName: temp.clientData.prenom,
                lastName: temp.clientData.nom,
                phone: temp.clientData.numero,
                email: temp.clientData.email,
                isPaid: PaymentStatus.COMPLETED,
                paymentMethod: PaymentMethod.SING_PAY,
                date: new Date().toISOString(),
                products: temp.items,
            };

            await this.productDatabaseService.createProductOrder(finalCommande);
            this.commandesTemp.delete(orderId);

            const html = mailType.generateOrderConfirmationEmail(
                temp.clientData.prenom,
                temp.clientData.nom,
                temp.montant,
                temp.clientData.numero,
                temp.items.map((item) => ({
                    title: item.title || '',
                    type: item.type || '',
                })),
            );
            await this.mailService.sendMail(temp.clientData.email, 'Confirmation de commande', html);

            return { success: true, message: 'Paiement confirmé, commande enregistrée.' };
        }

        if (status === 'Terminate' && result === 'TimeOutError') {
            return { success: false, message: 'Le paiement a expiré.' };
        }

        return { success: false, message: `Paiement non confirmé. Statut: ${status}` };
    }
}
