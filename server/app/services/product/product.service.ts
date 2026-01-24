import { ProductCommandeSchema } from '@app/schemas/product.schema';
import * as mailType from '@app/utils/generate.email';
import { PaymentMethod } from '@common/enums/payment-method';
import { PaymentStatus } from '@common/enums/payment-status';
import { Product } from '@common/interfaces/product';
import { ProductOrder } from '@common/interfaces/product-order';
import * as crypto from 'crypto';
import { setTimeout as delay } from 'timers/promises'; // utile pour faire une pause
import { Service } from 'typedi';
import { ProductDatabaseService } from '../database/product/product.database.service';
import { MailService } from '../mail/mail.service';
import { SingPayService } from '../singpay/singpay.service';

type CommandeTemp = {
    montant: number;
    items: Product[]; // Produits bruts uniquement
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

    async saveCommande(clientData: any, orderId: string, montant: number): Promise<{ success: boolean; message: string; link?: any }> {
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

        // const finalCommande = {
        //     ...parsed.data,
        //     montant: temp.montant,
        //     items: temp.items,
        // };

        //this.commandesTemp.delete(orderId);

        const payment = await this.singPayService.initiateSimple(orderId, 110, '074136289');
        if (!payment.success) {
            return { success: false, message: payment.message };
        }

        ///
        let statusOk = false;
        let maxAttempts = 9; // ⏳ max 1 minute (9 * 10s)
        let resultMessage = '';

        while (maxAttempts > 0) {
            console.log(`⏳ Vérification paiement [tentative ${10 - maxAttempts}/9]`);
            const tx = await this.singPayService.getTransactionByReference(orderId);

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
            this.commandesTemp.delete(orderId);

            const finalCommande: ProductOrder = {
                _id: '', // Mongo va le générer automatiquement
                idOrder: orderId,
                firstName: parsed.data.prenom,
                lastName: parsed.data.nom,
                phone: parsed.data.numero,
                email: parsed.data.email,
                isPaid: PaymentStatus.COMPLETED,
                paymentMethod: PaymentMethod.SING_PAY,
                date: new Date().toISOString(),
                products: temp.items,
            };

            await this.productDatabaseService.createProductOrder(finalCommande);

            const html = mailType.generateOrderConfirmationEmail(
                parsed.data.prenom,
                parsed.data.nom,
                montant,
                parsed.data.numero,
                temp.items.map((item) => {
                    const product = temp.items.find((p) => p._id === item._id);
                    return {
                        title: product?.title || '',
                        type: product?.type || '',
                    };
                }),
            );
            await this.mailService.sendMail(parsed.data.email, 'Confirmation de commande', html);

            return { success: true, message: 'Paiement confirmé, commande enregistrée.' };
        }

        this.commandesTemp.delete(orderId);
        return { success: false, message: resultMessage || 'Paiement non confirmé dans le temps imparti.' };
    }
}
