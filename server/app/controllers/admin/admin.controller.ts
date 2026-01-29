import { authenticateToken } from '@app/middlewares/auth.middleware';
import { adminLoginSchema } from '@app/schemas/admin.schema';
import { AuthService } from '@app/services/auth/auth.service';
import { DonationDatabaseService } from '@app/services/database/donation/donation.database.service';
import { GalleryDatabaseFtpService } from '@app/services/database/gallery/gallery.database.ftp.service';
import { MemberDatabaseService } from '@app/services/database/member/member.databse.service';
import { MongoStorageService } from '@app/services/database/member/mongo-storage.service';
import { NewsDatabaseFtpService } from '@app/services/database/news/news.database.ftp.service';
import { ProductDatabaseService } from '@app/services/database/product/product.database.service';
import { TransactionDatabaseService } from '@app/services/database/transaction/transaction.database.service';
import { PaymentStatus } from '@common/enums/payment-status';
import { Router } from 'express';
import { Service } from 'typedi';

@Service()
export class AdminController {
    router: Router;

    constructor(
        private memberDbService: MemberDatabaseService,
        private mongoStorageService: MongoStorageService,
        private donationDatabaseService: DonationDatabaseService,
        private productDbService: ProductDatabaseService,
        private newsDbService: NewsDatabaseFtpService,
        private galleryDbService: GalleryDatabaseFtpService,
        private authService: AuthService,
        private transactionDbService: TransactionDatabaseService,
    ) {
        this.router = Router();
        this.configureRoutes();
        this.initializeAuth();
    }

    private async initializeAuth(): Promise<void> {
        await this.authService.ensureDefaultAdmins();
    }

    private configureRoutes(): void {
        this.router.post('/login', async (req, res) => {
            const parseResult = adminLoginSchema.safeParse(req.body);

            if (!parseResult.success) {
                const errors = parseResult.error.flatten().fieldErrors;
                return res.status(400).json({ success: false, errors });
            }

            const { email, password } = parseResult.data;

            const result = await this.authService.validateAdmin(email, password);

            if (result.success) {
                return res.status(200).json({ success: true, token: result.token });
            }

            return res.status(401).json({ success: false, message: result.message });
        });

        // Endpoint stats pour le dashboard
        this.router.get('/stats', authenticateToken, async (_req, res) => {
            try {
                const [donations, members, products, orders, news, photos, transactionStats, recentTransactions] = await Promise.all([
                    this.donationDatabaseService.getAll(),
                    this.memberDbService.getAll(),
                    this.productDbService.getAllProducts(),
                    this.productDbService.getAllOrders(),
                    this.newsDbService.getAll(),
                    this.galleryDbService.getAll(),
                    this.transactionDbService.getStats(),
                    this.transactionDbService.getRecentTransactions(10),
                ]);

                const stats = {
                    donationsCount: donations.length,
                    totalDonationAmount: donations.reduce((sum, d) => sum + (d.amount || 0), 0),
                    pendingDonationsCount: donations.filter((d) => d.isPaid === PaymentStatus.PENDING).length,
                    membersCount: members.length,
                    pendingMembersCount: members.filter((m) => m.paymentStatus === PaymentStatus.PENDING).length,
                    validatedMembersCount: members.filter((m) => m.isValidated).length,
                    ordersCount: orders.length,
                    pendingOrdersCount: orders.filter((o) => o.isPaid === PaymentStatus.PENDING).length,
                    productsCount: products.length,
                    newsCount: news.length,
                    photosCount: photos.length,
                    recentDonations: donations
                        .sort((a, b) => new Date(b.registrationDate).getTime() - new Date(a.registrationDate).getTime())
                        .slice(0, 5)
                        .map((d) => ({
                            idDonation: d.idDonation,
                            firstName: d.firstName,
                            lastName: d.lastName,
                            amount: d.amount,
                            isPaid: d.isPaid,
                            registrationDate: d.registrationDate,
                        })),
                    recentOrders: orders
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .slice(0, 5)
                        .map((o) => ({
                            _id: o._id,
                            firstName: o.firstName,
                            lastName: o.lastName,
                            isPaid: o.isPaid,
                            date: o.date,
                        })),
                    // Nouvelles stats de transactions Singpay
                    transactions: {
                        total: transactionStats.total,
                        completed: transactionStats.byStatus.completed,
                        pending: transactionStats.byStatus.pending + transactionStats.byStatus.initiated,
                        failed: transactionStats.byStatus.failed + transactionStats.byStatus.timeout,
                        conversionRate: transactionStats.conversionRate,
                        totalAmount: transactionStats.totalAmount,
                        completedAmount: transactionStats.completedAmount,
                        byType: transactionStats.byType,
                    },
                    recentTransactions: recentTransactions.map((t) => ({
                        id: t.id,
                        type: t.type,
                        amount: t.amount,
                        status: t.status,
                        payerName: `${t.payerFirstName} ${t.payerLastName}`,
                        initiatedAt: t.initiatedAt,
                        completedAt: t.completedAt,
                    })),
                };

                return res.status(200).json(stats);
            } catch (err) {
                console.error('Erreur récupération stats:', err);
                return res.status(500).json({ message: 'Erreur lors de la récupération des statistiques' });
            }
        });

        // Endpoint pour les données du graphique d'évolution temporelle
        this.router.get('/stats/charts', authenticateToken, async (_req, res) => {
            try {
                const [donations, members] = await Promise.all([
                    this.donationDatabaseService.getAll(),
                    this.memberDbService.getAll(),
                ]);

                // Générer les 6 derniers mois
                const months: string[] = [];
                const now = new Date();
                for (let i = 5; i >= 0; i--) {
                    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
                    months.push(monthNames[date.getMonth()]);
                }

                // Compter les dons par mois
                const donationsByMonth: number[] = [];
                const membersByMonth: number[] = [];
                const amountsByMonth: number[] = [];

                for (let i = 5; i >= 0; i--) {
                    const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

                    const monthDonations = donations.filter((d) => {
                        const date = new Date(d.registrationDate);
                        return date >= startDate && date <= endDate;
                    });

                    const monthMembers = members.filter((m) => {
                        const date = new Date(m.registrationDate);
                        return date >= startDate && date <= endDate;
                    });

                    donationsByMonth.push(monthDonations.length);
                    membersByMonth.push(monthMembers.length);
                    amountsByMonth.push(monthDonations.reduce((sum, d) => sum + (d.amount || 0), 0));
                }

                return res.status(200).json({
                    labels: months,
                    donations: donationsByMonth,
                    members: membersByMonth,
                    amounts: amountsByMonth,
                });
            } catch (err) {
                console.error('Erreur récupération stats charts:', err);
                return res.status(500).json({ message: 'Erreur lors de la récupération des données du graphique' });
            }
        });

        this.router.get('/members', authenticateToken, async (req, res) => {
            try {
                const members = await this.memberDbService.getAll();
                res.status(200).json(members);
            } catch (error) {
                res.status(500).json({ message: 'Erreur serveur', error: error.message });
            }
        });

        this.router.get('/member/:id', authenticateToken, async (req, res) => {
            try {
                const data = await this.memberDbService.getById(req.params.id as string);
                if (!data.member) {
                    return res.status(404).json({ message: 'Membre non trouvé' });
                }
                return res.status(200).json(data);
            } catch (error) {
                console.error('Erreur getMemberById :', error);
                return res.status(500).json({ message: 'Erreur serveur' });
            }
        });

        this.router.get('/member/:id/document/:fileId', authenticateToken, async (req, res) => {
            const fileId = req.params.fileId as string;

            try {
                const { stream, mime } = await this.mongoStorageService.getFileStream(fileId);
                res.setHeader('Content-Type', mime);
                res.setHeader('Content-Disposition', 'inline');
                stream.pipe(res);
            } catch (err) {
                console.error('❌ Erreur streaming document GridFS', err);
                res.status(500).json({ message: 'Erreur lors du téléchargement du fichier.' });
            }
        });

        this.router.patch('/member/:id/status', authenticateToken, async (req, res) => {
            const { status } = req.body;

            if (![PaymentStatus.PENDING, PaymentStatus.COMPLETED, PaymentStatus.FAILURE].includes(status)) {
                return res.status(400).json({ message: 'Statut invalide' });
            }

            try {
                await this.memberDbService.updateStatus(req.params.id as string, status);
                return res.status(200).json({ message: 'Statut mis à jour avec succès' });
            } catch (err) {
                return res.status(500).json({ message: 'Erreur serveur' });
            }
        });

        this.router.patch('/member/:id/validation', authenticateToken, async (req, res) => {
            const { isValidated } = req.body;
            try {
                await this.memberDbService.updateValidation(req.params.id as string, isValidated);
                return res.status(200).json({ message: 'Certification mise à jour' });
            } catch (err) {
                return res.status(500).json({ message: 'Erreur serveur' });
            }
        });

        this.router.delete('/member/:id', authenticateToken, async (req, res) => {
            try {
                const id = req.params.id as string;
                await this.memberDbService.deleteById(id);
                return res.status(200).json({ message: 'Membre supprimé avec succès' });
            } catch (err) {
                console.error('Erreur suppression membre:', err);
                return res.status(500).json({ message: 'Erreur lors de la suppression du membre' });
            }
        });

        this.router.get('/donations', authenticateToken, async (req, res) => {
            try {
                const allDonations = await this.donationDatabaseService.getAll();
                return res.status(200).json(allDonations);
            } catch (err) {
                return res.status(500).json({ message: 'Erreur lors du chargement des dons', error: err });
            }
        });

        this.router.get('/donation/:id', authenticateToken, async (req, res) => {
            const id = req.params.id as string;
            try {
                const donation = await this.donationDatabaseService.getById(id);
                if (!donation) {
                    return res.status(404).json({ message: 'Don non trouvé' });
                }
                return res.status(200).json(donation);
            } catch (err) {
                return res.status(500).json({ message: 'Erreur lors de la récupération du don', error: err });
            }
        });

        this.router.patch('/donation/:id/status', authenticateToken, async (req, res) => {
            const id = req.params.id as string;
            const { status } = req.body;

            if (!status) {
                return res.status(400).json({ message: 'Le nouveau statut est requis' });
            }

            try {
                await this.donationDatabaseService.updateStatus(id, status);
                return res.status(200).json({ message: 'Statut mis à jour avec succès' });
            } catch (err) {
                return res.status(500).json({ message: 'Erreur lors de la mise à jour du statut', error: err });
            }
        });
    }
}
