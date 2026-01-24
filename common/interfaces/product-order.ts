import { PaymentMethod } from '@common/enums/payment-method';
import { PaymentStatus } from '@common/enums/payment-status';
import { Product } from '@common/interfaces/product';

export interface ProductOrder {
    _id: string;
    idOrder: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    isPaid: PaymentStatus;
    paymentMethod: PaymentMethod;
    date: string;
    products: Product[];
}
