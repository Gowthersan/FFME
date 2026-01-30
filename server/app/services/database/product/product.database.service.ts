import { ProductModel, ProductOrderModel } from '@app/models/products.model';
import { SftpPoolService } from '@app/services/sftp/sftp-pool.service';
import { ProductComment } from '@common/interfaces/comment';
import { PaginatedResponse } from '@common/interfaces/paginated-response';
import { Product } from '@common/interfaces/product';
import { ProductOrder } from '@common/interfaces/product-order';
import mime from 'mime-types';
import { Types } from 'mongoose';
import sharp from 'sharp';
import { Readable } from 'stream';
import { Service } from 'typedi';
import { v4 as uuidv4 } from 'uuid';

@Service()
export class ProductDatabaseService {
    constructor(private sftpPool: SftpPoolService) {}

    async createProduct(file: Express.Multer.File, data: Product): Promise<Product> {
        const sftp = await this.sftpPool.acquire();
        const filename = `productImages/${uuidv4()}.webp`;
        try {
            const compressed = await sharp(file.buffer).resize({ width: 1280 }).webp({ quality: 70 }).toBuffer();
            await sftp.mkdir('productImages', true);
            await sftp.put(compressed, filename);

            const newProduct = new ProductModel({ ...data, image: filename });
            return await newProduct.save();
        } finally {
            this.sftpPool.release(sftp);
        }
    }

    // Modifier un produit (sans changer l'image ici)
    async updateProduct(id: string, data: Partial<Product>): Promise<Product | null> {
        return await ProductModel.findByIdAndUpdate(id, data, { new: true });
    }

    async deleteProduct(id: string): Promise<boolean> {
        const product = await ProductModel.findById(id);
        if (!product) return false;

        const sftp = await this.sftpPool.acquire();
        try {
            if (product.image) {
                await sftp.delete(product.image);
            }
            await ProductModel.deleteOne({ _id: id });
            return true;
        } catch {
            return false;
        } finally {
            this.sftpPool.release(sftp);
        }
    }

    async streamImage(filename: string, retries = 3): Promise<{ stream: Readable; mime: string }> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= retries; attempt++) {
            let sftp = null;
            try {
                sftp = await this.sftpPool.acquire();
                const path = filename.startsWith('productImages/') ? filename : `productImages/${filename}`;
                const buffer = await sftp.get(path);
                const mimeType = mime.lookup(filename) || 'application/octet-stream';
                const stream = Readable.from(buffer);
                return { stream, mime: mimeType.toString() };
            } catch (err) {
                lastError = err as Error;
                console.error(`Erreur streaming product image (tentative ${attempt}/${retries}):`, (err as Error).message);
                if (attempt < retries) {
                    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
                }
            } finally {
                if (sftp) {
                    this.sftpPool.release(sftp);
                }
            }
        }

        throw new Error(`Erreur SFTP après ${retries} tentatives : ${lastError?.message}`);
    }

    async getAllProducts(): Promise<Product[]> {
        return await ProductModel.find();
    }

    async getAllProductsPaginated(page = 1, limit = 20): Promise<PaginatedResponse<Product>> {
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            ProductModel.find().skip(skip).limit(limit).lean(),
            ProductModel.countDocuments(),
        ]);
        return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async addComment(productId: string, commentData: any) {
        const product = await ProductModel.findById(productId);
        if (!product) throw new Error('Produit introuvable');

        const newComment: ProductComment = {
            userName: commentData.username,
            content: commentData.content,
            review: commentData.review,
            isChecked: true, // Visible immédiatement, l'admin peut supprimer si besoin
            _id: new Types.ObjectId(),
            idComment: 'CMD-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        };

        product.comments.push(newComment);

        // Recalculer la moyenne avec le nouveau commentaire
        const checkedComments = product.comments.filter((c) => c.isChecked);
        if (checkedComments.length > 0) {
            const sum = checkedComments.reduce((total, c) => total + (c.review ?? 0), 0);
            product.averageReview = parseFloat((sum / checkedComments.length).toFixed(2));
        }

        await product.save();

        return newComment;
    }

    async getValidatedCommentsByProductId(productId: string) {
        const product = await ProductModel.findById(productId, { comments: 1, title: 1 });

        if (!product) throw new Error('Produit non trouvé');

        const validatedComments = product.comments
            .filter((c) => c.isChecked)
            .map((c) => ({
                productTitle: product.title,
                username: c.userName,
                content: c.content,
                review: c.review,
            }));

        return validatedComments;
    }

    // Récupérer un produit par ID
    async getProductById(id: string): Promise<Product | null> {
        return await ProductModel.findById(id);
    }

    // Valider ou supprimer un commentaire
    async patchProductComment(productId: string, commentId: string, action: 'validate' | 'delete') {
        const product = await ProductModel.findById(productId);
        if (!product) throw new Error('Produit non trouvé');

        const index = product.comments.findIndex((c) => c._id.toString() === commentId);
        if (index === -1) throw new Error('Commentaire introuvable');

        if (action === 'delete') {
            product.comments.splice(index, 1);
        } else if (action === 'validate') {
            product.comments[index].isChecked = true;
        }

        // 🔁 Recalcul de la moyenne sur les commentaires validés
        const checkedComments = product.comments.filter((c) => c.isChecked);
        if (checkedComments.length > 0) {
            const sum = checkedComments.reduce((total, c) => total + (c.review ?? 0), 0);
            product.averageReview = parseFloat((sum / checkedComments.length).toFixed(2));
        } else {
            product.averageReview = 0;
        }

        await product.save();
        return product;
    }

    // COMMANDES
    async createProductOrder(order: ProductOrder): Promise<ProductOrder> {
        const { _id, ...orderWithoutId } = order; // on ignore _id pour que Mongo le génère
        const saved = new ProductOrderModel(orderWithoutId);
        return await saved.save();
    }

    async getAllOrders(): Promise<ProductOrder[]> {
        return await ProductOrderModel.find().sort({ date: -1 });
    }

    async getAllOrdersPaginated(page = 1, limit = 20): Promise<PaginatedResponse<ProductOrder>> {
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            ProductOrderModel.find().sort({ date: -1 }).skip(skip).limit(limit).lean(),
            ProductOrderModel.countDocuments(),
        ]);
        return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async getOrderById(orderId: string): Promise<ProductOrder | null> {
        return await ProductOrderModel.findById(orderId);
    }

    async updateOrderStatus(orderId: string, newStatus: string): Promise<ProductOrder | null> {
        return await ProductOrderModel.findByIdAndUpdate(orderId, { isPaid: newStatus }, { new: true });
    }
}
