import prisma from '../../config/prismaClient.js';
import { convertBigIntToString } from '../../config/convertBigIntToString.js';

export const getTradeHistory = async (req, res) => {
    const admin = req.admin; // assuming middleware sets admin data
    try {
        const perPage = parseInt(req.query.per_page) || 10;
        const userId = req.query.user_id ? (req.query.user_id) : null;
        const whereClause = {};

        if (userId) {
            whereClause.OR = [
            { seller_id: userId },
                { buyer_id: userId }
            ];
        }

        if (req.query.trade_id) {
            whereClause.trade_id = req.query.trade_id;
        }
        if (req.query.cryptocurrency) {
            whereClause.asset = req.query.cryptocurrency;
        }
        if (req.query.tradeStatus) {
            whereClause.trade_status = req.query.tradeStatus;
        }
        if (req.query.tradeType) {
            whereClause.trade_type = req.query.tradeType;
        }

        // Counts
        const totalTrade = await prisma.trades.count();
        const totalFilteredTrade = await prisma.trades.count({ where: whereClause });

        // Pagination
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * perPage;

        const tradeHistories = await prisma.trades.findMany({
            where: whereClause,
            skip,
            take: perPage,
            orderBy: { trade_id: 'desc' } // or tradeId if camelCase
        });

        // Post-processing
        const processedTrades = tradeHistories.map((trade) => {
            const payment = trade.payment ? JSON.parse(trade.payment) : null;
            const review = trade.review ? JSON.parse(trade.review) : null;

            let payment_details = trade.payment_details
                ? `${process.env.BASE_URL || 'http://localhost:5000'}/storage/${trade.payment_details}`
                : null;

            const role = userId
                ? trade.buyer_id === userId ? 'buyer' : 'seller'
                : trade.buyer_id === trade.user_id ? 'buyer' : 'seller';

            return {
                ...trade,
                payment,
                review,
                payment_details,
                role
            };
        });

        // Pagination metadata
        const pagination = {
            current_page: page,
            per_page: perPage,
            total: totalFilteredTrade,
            last_page: Math.ceil(totalFilteredTrade / perPage),
            from: skip + 1,
            to: skip + processedTrades.length
        };
        const safeData = convertBigIntToString(processedTrades);

        return res.status(200).json({
            status: true,
            message: 'Trade history fetched successfully.',
            data: safeData,
            pagination,
            analytics: {
                totalTrade,
                totalFilteredTrade
            }
        });

    } catch (error) {
        console.error('Error fetching trade history:', error);
        return res.status(500).json({
            status: false,
            message: 'Unable to fetch trade history.',
            errors: error.message
        });
    }
};
