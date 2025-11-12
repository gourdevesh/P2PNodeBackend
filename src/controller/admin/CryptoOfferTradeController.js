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



export const getCryptoAd = async (req, res) => {
  try {
    const admin = req.admin; // from middleware

    const {
      per_page = 10,
      user_id,
      txn_type,
      cryptocurrency,
      paymentMethod,
      offerLocation,
      traderLocation,
      activeTrader,
      activeCryptoOffer,
      acceptedOffer,
    } = req.query;

    // ✅ Convert pagination values properly
    const perPage = Number(per_page) > 0 ? Number(per_page) : 10;
    const page = Number(req.query.page) > 0 ? Number(req.query.page) : 1;
    const skip = (page - 1) * perPage;

    // ✅ Base filter
    const where = {};

    if (user_id) where.user_id = BigInt(user_id);
    if (txn_type) where.transaction_type = txn_type;
    if (cryptocurrency) where.cryptocurrency = cryptocurrency;
    if (offerLocation) where.country = offerLocation.toLowerCase();
    if (activeCryptoOffer) where.is_active = activeCryptoOffer === "true";
    if (acceptedOffer) where.is_accepted = acceptedOffer === "true";

    // ✅ JSON filter (only works if your DB supports JSON)
// ✅ JSON field filter for payment method
if (paymentMethod) {
  where.payment_method = {
    contains: paymentMethod.toLowerCase(), // ✅ Prisma JSON compatible
  };
}


    // ✅ User sub-filters
    const userWhere = {};
    if (traderLocation) userWhere.country = traderLocation.toLowerCase();
    if (activeTrader === "true") {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      userWhere.last_seen = { gte: tenMinutesAgo };
    }

    // ✅ Analytics counts
    const [
      totalCryptoAds,
      totalBuyCryptoAds,
      totalSellCryptoAds,
      totalActiveAds,
      totalAcceptedAds,
    ] = await Promise.all([
      prisma.crypto_ads.count(),
      prisma.crypto_ads.count({ where: { transaction_type: "buy" } }),
      prisma.crypto_ads.count({ where: { transaction_type: "sell" } }),
      prisma.crypto_ads.count({ where: { is_active: true } }),
      prisma.crypto_ads.count({ where: { is_accepted: true } }),
    ]);

    // ✅ Main Query (safe)
    const [totalFilteredDataCount, cryptoAds] = await Promise.all([
      prisma.crypto_ads.count({ where }),
      prisma.crypto_ads.findMany({
        where: {
          ...where,
          ...(Object.keys(userWhere).length > 0 && { user: userWhere }),
        },
        include: { user: true },
        orderBy: { crypto_ad_id: "desc" },
        skip,
        take: perPage,
      }),
    ]);

    // ✅ Format data
    const data = cryptoAds.map((ad) => ({
      ...ad,
      payment_method: ad.payment_method ? JSON.parse(ad.payment_method) : null,
    }));

    // ✅ Pagination info
    const pagination = {
      current_page: page,
      per_page: perPage,
      total: totalFilteredDataCount,
      last_page: Math.ceil(totalFilteredDataCount / perPage),
      next_page_url:
        page < Math.ceil(totalFilteredDataCount / perPage)
          ? `/admin/crypto-ads?page=${page + 1}`
          : null,
      prev_page_url: page > 1 ? `/admin/crypto-ads?page=${page - 1}` : null,
    };
    const safeData = convertBigIntToString(data);

    // ✅ Success Response
    return res.json({
      status: true,
      message: "Crypto advertisement fetched successfully.",
      data:safeData,
      pagination,
      analytics: {
        totalCryptoAds,
        totalBuyCryptoAds,
        totalSellCryptoAds,
        totalActiveAds,
        totalAcceptedAds,
        totalFilteredDataCount,
      },
    });
  } catch (error) {
    console.error("Error fetching crypto ads:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong.",
      errors: error.message,
    });
  }
};
