import SFTP from 'ssh2-sftp-client';
import { Service } from 'typedi';

interface PooledConnection {
    sftp: InstanceType<typeof SFTP>;
    inUse: boolean;
    createdAt: Date;
    lastUsed: Date;
}

@Service()
export class SftpPoolService {
    private pool: PooledConnection[] = [];
    private readonly maxPoolSize = 5;
    private readonly connectionTimeout = 30000;
    private readonly maxConnectionAge = 5 * 60 * 1000;

    private async createConnection(): Promise<InstanceType<typeof SFTP>> {
        const sftp = new SFTP();
        await sftp.connect({
            host: process.env.FTP_HOST,
            port: Number(process.env.FTP_PORT) || 22,
            username: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
            readyTimeout: this.connectionTimeout,
            retries: 3,
            retry_factor: 2,
            retry_minTimeout: 2000,
        });
        return sftp;
    }

    async acquire(): Promise<InstanceType<typeof SFTP>> {
        this.cleanupStaleConnections();

        const availableConnection = this.pool.find((conn) => !conn.inUse);

        if (availableConnection) {
            availableConnection.inUse = true;
            availableConnection.lastUsed = new Date();
            return availableConnection.sftp;
        }

        if (this.pool.length < this.maxPoolSize) {
            try {
                const sftp = await this.createConnection();
                const pooledConnection: PooledConnection = {
                    sftp,
                    inUse: true,
                    createdAt: new Date(),
                    lastUsed: new Date(),
                };
                this.pool.push(pooledConnection);
                return sftp;
            } catch (error) {
                console.error('Erreur création connexion SFTP:', error);
                throw error;
            }
        }

        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(async () => {
                const available = this.pool.find((conn) => !conn.inUse);
                if (available) {
                    clearInterval(checkInterval);
                    available.inUse = true;
                    available.lastUsed = new Date();
                    resolve(available.sftp);
                }
            }, 100);

            setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('Timeout en attente d\'une connexion SFTP disponible'));
            }, this.connectionTimeout);
        });
    }

    release(sftp: InstanceType<typeof SFTP>): void {
        const connection = this.pool.find((conn) => conn.sftp === sftp);
        if (connection) {
            connection.inUse = false;
            connection.lastUsed = new Date();
        }
    }

    private cleanupStaleConnections(): void {
        const now = Date.now();

        this.pool = this.pool.filter((conn) => {
            const age = now - conn.createdAt.getTime();
            const idle = now - conn.lastUsed.getTime();

            if (!conn.inUse && (age > this.maxConnectionAge || idle > this.maxConnectionAge)) {
                conn.sftp.end().catch(() => {});
                return false;
            }
            return true;
        });
    }

    async closeAll(): Promise<void> {
        const closePromises = this.pool.map(async (conn) => {
            try {
                await conn.sftp.end();
            } catch (error) {
                console.error('Erreur fermeture connexion SFTP:', error);
            }
        });

        await Promise.all(closePromises);
        this.pool = [];
    }

    getPoolStats(): { total: number; inUse: number; available: number } {
        return {
            total: this.pool.length,
            inUse: this.pool.filter((c) => c.inUse).length,
            available: this.pool.filter((c) => !c.inUse).length,
        };
    }
}
