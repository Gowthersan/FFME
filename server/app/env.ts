import * as dotenv from 'dotenv';
dotenv.config();

export const JWT_SECRET = process.env.JWT_SECRET || 'fallback';

export const DB_URL = process.env.DB_URL || '';
export const MAIL_API_KEY = process.env.MAIL_API_KEY || '';

export const DATABASE_URL = '';

export const singPayConfig = {
    clientId: 'e677f1a8-4033-4595-9193-6c2474d64046',
    clientSecret: '43ea50a5feca0340d241b9b60fbf9365137d5e188a41a91295b37171b4e38b63',
    walletId: '68231f26ac445b3ed889a6fa',
    disbursementId: '682324f8ac445b3cd189a9f2',
};

export const HOST = {
    serverUrl: 'http://localhost:3000/',

    // serverUrl: 'https://fondationfrancoismeye.ga', //serveur front

    //serverUrl: // Ajouter ici le server URL et commenter l'autre
};
