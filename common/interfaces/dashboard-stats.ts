export interface DashboardStats {
    donationsCount: number;
    totalDonationAmount: number;
    pendingDonationsCount: number;
    membersCount: number;
    pendingMembersCount: number;
    validatedMembersCount: number;
    ordersCount: number;
    pendingOrdersCount: number;
    productsCount: number;
    newsCount: number;
    photosCount: number;
    recentDonations: Array<{
        idDonation: string;
        firstName: string;
        lastName: string;
        amount: number;
        isPaid: string;
        registrationDate: string;
    }>;
    recentOrders: Array<{
        _id: string;
        firstName: string;
        lastName: string;
        isPaid: string;
        date: string;
    }>;
}
