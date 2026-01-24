import { MembershipData, MembershipSchema } from '@app/schemas/membership.schema';
import { PaymentMethod } from '@common/enums/payment-method';
import { PaymentStatus } from '@common/enums/payment-status';
import { Member } from '@common/interfaces/member';
import * as crypto from 'crypto';
import { setTimeout as delay } from 'timers/promises'; // utile pour faire une pause
import { Service } from 'typedi';
import { MemberDatabaseService } from '../database/member/member.databse.service';
import { MongoStorageService } from '../database/member/mongo-storage.service';
import { SingPayService } from '../singpay/singpay.service';

@Service()
export class MembershipService {
    private readonly storedMemberships: Map<string, MembershipData> = new Map();
    private readonly timeouts: Map<string, NodeJS.Timeout> = new Map();

    private readonly EXPIRATION_MS = 2 * 60 * 1000; //2 minutes

    constructor(
        //private readonly ftpUploadService: FtpUploadService,
        private readonly mongoStorageService: MongoStorageService,
        private readonly singPayService: SingPayService,
        private readonly memberDatabaseService: MemberDatabaseService,
    ) {}

    async processMembership(
        data: unknown,
        files: { [key: string]: { path: string; originalname: string; mimetype: string } },
    ): Promise<{ success: boolean; message: string; membershipId?: string }> {
        const parsed = MembershipSchema.safeParse(data);

        if (!parsed.success) {
            const message = parsed.error.issues.map((e) => e.message).join(', ');
            return { success: false, message };
        }

        const cleanData: MembershipData = parsed.data;
        const membershipId = crypto.randomUUID();

        // Ancien FTP (commenté) :
        // const ftpResult = await this.ftpUploadService.uploadFilesToMembershipFolder(membershipId, files);

        // Nouveau : upload des fichiers dans MongoDB
        const uploadResult = await this.mongoStorageService.uploadTempFiles(membershipId, files);

        if (!uploadResult.success) {
            return {
                success: false,
                message: `Erreur lors de l'envoi des fichiers : ${uploadResult.error}`,
            };
        }

        // Injecter les IDs dans cleanData.fichiers (avec typage temporaire)
        (cleanData as any).fichiers = {};
        for (const [key, file] of Object.entries(files)) {
            (cleanData as any).fichiers[key] = {
                originalname: file.originalname,
                mimetype: file.mimetype,
                id: uploadResult.ids?.[key] || '',
            };
        }

        // Stockage temporaire en mémoire
        this.storedMemberships.set(membershipId, cleanData);
        this.timeouts.set(
            membershipId,
            setTimeout(async () => {
                await this.deleteMembership(membershipId);
                console.log(`Adhésion expirée : ${membershipId}`);
            }, this.EXPIRATION_MS),
        );

        console.log(`Adhésion stockée avec ID ${membershipId}`);
        return {
            success: true,
            message: 'Demande d’adhésion enregistrée avec succès.',
            membershipId,
        };
    }

    getMembershipById(id: string): MembershipData | undefined {
        return this.storedMemberships.get(id);
    }

    async initiatePaymentbyMethod(
        membershipId: string,
        method: PaymentMethod,
        montant: number,
    ): Promise<{ success: boolean; member?: Member; message?: string; link?: string }> {
        const data = this.storedMemberships.get(membershipId);

        if (!data) {
            return { success: false, message: 'Adhésion introuvable' };
        }

        // Mise à jour du moyen de paiement dans les données temporaires
        (data as any).paymentMethod = method;

        const member: Member = {
            idMember: membershipId,
            firstName: data.prenom,
            lastName: data.nom,
            typeMember: data.typeAdhesion,
            isValidated: false,
            registrationDate: new Date().toString(),
            phone: data.numero,
            email: data.email,
            paymentMethod: method,
            paymentStatus: PaymentStatus.PENDING,
            amount: montant,
            additionalDocuments: [],
        };

        const timeout = this.timeouts.get(membershipId);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(membershipId);
        }
        // Si SING PAY
        if (method === PaymentMethod.SING_PAY) {
            // const result = await this.singPayService.initiatePayment(membershipId, 120); // montant);
            // if (!result.success) {
            //     return {
            //         success: false,
            //         message: result.message || 'Échec lors de l’initiation du paiement.',
            //     };
            // }
            // member.additionalDocuments = Object.entries(data.fichiers as Record<string, { id: string }>).map(([key, file]) => ({
            //     title: key,
            //     path: file.id,
            // }));

            // console.log(member);
            // return {
            //     success: true,
            //     message: 'Redirection vers Sing Pay...',
            //     link: result.link,
            // };
            const payment = await this.singPayService.initiateSimple(membershipId, 110, '074136289');
            if (!payment.success) {
                return { success: false, message: payment.message };
            }

            let statusOk = false;
            let maxAttempts = 9; // ⏳ max 1.30 minute (9 * 10s)
            let resultMessage = '';

            while (maxAttempts > 0) {
                console.log(`⏳ Vérification paiement [tentative ${10 - maxAttempts}/9]`);
                const tx = await this.singPayService.getTransactionByReference(membershipId);

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
                member.additionalDocuments = Object.entries(data.fichiers as unknown as Record<string, { path: string; originalname: string }>).map(
                    ([key, file]) => ({
                        title: key,
                        path: `/membership-valid/${membershipId}/${file.originalname}`, // ou `/api/membership/file/${file.id}`
                    }),
                );

                const moveResult = await this.mongoStorageService.moveTempToValid(membershipId);

                if (!moveResult.success) {
                    return {
                        success: false,
                        message: `Erreur lors du déplacement des fichiers : ${moveResult.error}`,
                    };
                }
                member.paymentStatus = PaymentStatus.COMPLETED;
                await this.memberDatabaseService.create(member);
                this.storedMemberships.delete(membershipId);

                return { success: true, message: 'Paiement confirmé, commande enregistrée.' };
            }
            this.storedMemberships.delete(membershipId);
            return { success: false, message: resultMessage || 'Paiement non confirmé dans le temps imparti.' };
        }

        // Sinon, on considère que c’est un paiement manuel
        // 3. Déplacer les fichiers vers le dossier final
        //const moveResult = await this.ftpUploadService.moveMembershipFolderToValid(membershipId);
        const moveResult = await this.mongoStorageService.moveTempToValid(membershipId);

        if (!moveResult.success) {
            return {
                success: false,
                message: `Erreur lors du déplacement des fichiers : ${moveResult.error}`,
            };
        }

        // 4. Créer un objet final Member
        member.additionalDocuments = Object.entries(data.fichiers).map(([key, file]) => ({
            title: key,
            path: `/membership-valid/${membershipId}/${file.originalname}`, // Path CMS
        }));

        // 5. Enregistrer dans MongoDB
        //await this.saveMemberToDatabase(finalMember);
        await this.memberDatabaseService.create(member);

        // 2. Supprimer l’adhésion temporaire
        this.storedMemberships.delete(membershipId);

        // 6. Retourner confirmation
        return {
            success: true,
            message: 'Votre adhésion a été enregistrée. Vous recevrez les instructions par email.',
        };
    }

    async deleteMembership(id: string): Promise<boolean> {
        const deleted = this.storedMemberships.delete(id);
        const timeout = this.timeouts.get(id);
        if (timeout) clearTimeout(timeout);
        this.timeouts.delete(id);
        try {
            await this.mongoStorageService.deleteTempFiles(id);
            //await this.ftpUploadService.deleteMembershipFolder(id);
            console.log(`Dossier FTP pour l'adhésion ${id} supprimé.`);
        } catch (err) {
            console.warn(`Impossible de supprimer le dossier FTP de ${id} :`, err);
        }
        return deleted;
    }
}
