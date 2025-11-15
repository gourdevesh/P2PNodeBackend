import { convertBigIntToString } from "../../config/convertBigIntToString.js";
import prisma from "../../config/prismaClient.js";
import { getCryptoLogo } from "../../config/ReusableCode.js";

export const getMyCryptoAd = async (req, res) => {
    try {
        const user = req.user;

        if (!user || !user.user_id) {
            return res.status(401).json({
                status: false,
                message: "Unauthorized user.",
            });
        }

        let {
            txn_type,
            is_active,
            cryptocurrency,
            per_page = 10,
            page = 1,
        } = req.query;

        per_page = Number(per_page);
        page = Number(page);

        let filters = {
            user_id: BigInt(user.user_id),
        };

        if (txn_type) {
            filters.transaction_type = txn_type.toLowerCase();
        }

        if (is_active) {
            filters.is_active = is_active === "true";
        }

        if (cryptocurrency) {
            filters.cryptocurrency = cryptocurrency.toLowerCase();
        }


        // COUNT
        const count = await prisma.crypto_ads.count({
            where: filters,
        });

        // Pagination calculation
        const skip = (page - 1) * per_page;

        // FETCH RECORDS
        const cryptoAds = await prisma.crypto_ads.findMany({
            where: filters,
            orderBy: { crypto_ad_id: "desc" },
            skip,
            take: per_page,
        });
        console.log("cryptoAds", cryptoAds)

        // Add logo to each ad
        const updatedAds = cryptoAds.map(ad => ({
            ...ad,
            cryptocurrencyLogo: getCryptoLogo(ad.cryptocurrency, req),
        }));

        // Pagination Format
        const lastPage = Math.ceil(count / per_page);

        const pagination = {
            current_page: page,
            from: skip + 1,
            to: skip + updatedAds.length,
            total: count,
            first_page_url: `${req.protocol}://${req.get("host")}${req.path}?page=1`,
            last_page: lastPage,
            last_page_url: `${req.protocol}://${req.get("host")}${req.path}?page=${lastPage}`,
            next_page_url:
                page < lastPage
                    ? `${req.protocol}://${req.get("host")}${req.path}?page=${page + 1}`
                    : null,
            per_page,
            prev_page_url:
                page > 1
                    ? `${req.protocol}://${req.get("host")}${req.path}?page=${page - 1}`
                    : null,
            links: [],
            path: `${req.protocol}://${req.get("host")}${req.path}`,
        };
        const safeData = convertBigIntToString(updatedAds)

        return res.status(200).json({
            status: true,
            message: "Crypto advertisement fetched successfully.",
            data: safeData,
            pagination: pagination,
            analytics: { total_ads: count },
            logo: getCryptoLogo(null, req),
        });
    } catch (error) {
        console.error("GET MY CRYPTO AD ERROR:", error);

        return res.status(500).json({
            status: false,
            message: "Something went wrong.",
            errors: error.message,
        });
    }
};


export const createCryptoAd = async (req, res) => {
    let user = req.user; // user from middleware
    console.log(req.body.price_type)
    try {
        if (!user) {
            return res.status(401).json({
                status: false,
                message: "Unauthorized. User not found."
            });
        }

        // Convert fields similar to Laravel merge()
        req.body.require_verification =
            req.body.require_verification === "true" || req.body.require_verification === true;

        req.body.preferred_currency = req.body.preferred_currency?.toLowerCase();
        req.body.country = req.body.country?.toLowerCase();

        // ---------------------------
        // VALIDATION (MANUAL LIKE LARAVEL)
        // ---------------------------
        const required = (field) => {
            if (!req.body[field]) throw `${field} is required`;
        };

        required("cryptocurrency");
        required("transaction_type");
        required("payment_type");
        required("paymentMethod");
        required("price_type");
        required("price");
        required("min_trade_limit");
        required("max_trade_limit");
        required("offer_time_limit");
        required("visibility");

        if (req.body.max_trade_limit <= req.body.min_trade_limit)
            throw "max_trade_limit must be greater than min_trade_limit";

        if (req.body.new_user_limit &&
            req.body.new_user_limit <= req.body.min_trade_limit)
            throw "new_user_limit must be greater than minimum trade limit";

        // ---------------------------
        // PAYMENT METHOD CHECK
        // ---------------------------

        let paymentMethod = null;

        if (req.body.payment_type === "bank") {
            paymentMethod = await prisma.payment_details.findFirst({
                where: {
                    user_id: BigInt(user.user_id),
                    pd_id: Number(req.body.payment_method_id || 0)
                }
            });
        } else if (req.body.payment_type === "upi") {
            paymentMethod = await prisma.upi_details.findFirst({
                where: {
                    user_id: BigInt(user.user_id),
                    id: Number(req.body.payment_method_id || 0)
                }
            });
        }

        if (!paymentMethod) {
            return res.status(400).json({
                status: false,
                message: "Payment details not found."
            });
        }

        const payment_method_json = {
            payment_method: req.body.paymentMethod,
            payment_details: paymentMethod
        };
        offer_tags: req.body.offer_tags
            ? JSON.stringify(req.body.offer_tags)
            : null,

            // ---------------------------
            // CREATE AD (TRANSACTION)
            // ---------------------------
            await prisma.$transaction(async (tx) => {
                await tx.crypto_ads.create({
                    data: {
                        user_id: BigInt(user.user_id),
                        cryptocurrency: req.body.cryptocurrency,
                        transaction_type: req.body.transaction_type,
                        payment_type: req.body.payment_type,
                        payment_method: JSON.stringify(payment_method_json),
                        preferred_currency: req.body.preferred_currency,
                        country: req.body.country,
                        pricing_type: req.body.price_type,  // ✅ REQUIRED FIELD
                        price: Number(req.body.price),
                        offer_margin: req.body.offer_margin ? Number(req.body.offer_margin) : null,
                        min_trade_limit: Number(req.body.min_trade_limit),
                        max_trade_limit: Number(req.body.max_trade_limit),
                        remaining_trade_limit: Number(req.body.max_trade_limit),
                        offer_time_limit: Number(req.body.offer_time_limit),
                        offer_tags: req.body.offer_tags
                            ? JSON.stringify(req.body.offer_tags)
                            : null,
                        offer_label: req.body.offer_label || null,
                        offer_terms: req.body.offer_terms || null,
                        require_verification: req.body.require_verification,
                        visibility: req.body.visibility,
                        min_trade_requirement: req.body.min_trades_required
                            ? Number(req.body.min_trades_required)
                            : null,

                        new_user_limit: req.body.new_user_limit
                            ? Number(req.body.new_user_limit)
                            : null
                    }
                });


                await tx.notifications.create({
                    data: {
                        user_id: BigInt(user.user_id),
                        title: "Crypto Ad created successfully.",
                        message: `You have successfully created your Crypto Advertisement to ${req.body.transaction_type} ${req.body.cryptocurrency}.`,
                        type: "account_activity",
                        is_read: false
                    }
                });

                // 🚨 FIX: Return nothing (undefined)
                return;
            });

        // This will run now
        console.log("result: crypto ad created");

        return res.status(201).json({
            status: true,
            message: "Crypto advertisement created successfully."

        });

    } catch (error) {
        return res.status(500).json({
            status: false,
            message: "Failed to create advertisement.",
            errors: error?.message || error
        });
    }
};
export const getCryptoAd = async (req, res) => {
    try {
        const user = req.user;

        const {
            ad_id,
            txn_type,
            cryptocurrency,
            paymentMethod,
            offerLocation,
            traderLocation,
            activeTrader,
            user_id,
            maxAmount,
        } = req.query;

        const perPage = Number(req.query.per_page) || 10;

        // =====================================================
        // MULTI FILTER LIST
        // =====================================================
        let filters = {
            is_active: true,
            remaining_trade_limit: { gt: 0 },
        };

        // ad_id filter
        if (ad_id) filters.crypto_ad_id = BigInt(ad_id);

        if (txn_type) filters.transaction_type = txn_type.toLowerCase();
        if (cryptocurrency) filters.cryptocurrency = cryptocurrency.toLowerCase();
        if (offerLocation) filters.country = offerLocation.toLowerCase();
        if (user_id) filters.user_id = BigInt(user_id);
        if (paymentMethod) {
            filters.payment_method = {
                contains: `"payment_method":"${paymentMethod.toLowerCase()}"`,
            };
        }

        // USER nested filters
        let userWhere = {};
        if (traderLocation) userWhere.country = traderLocation.toLowerCase();
        if (activeTrader === "true")
            userWhere.last_seen = { gte: moment().subtract(10, "minutes").toDate() };

        if (Object.keys(userWhere).length > 0) {
            filters.user = userWhere;
        }

        // =====================================================
        // COUNT & PAGINATION
        // =====================================================
        const totalAds = await prisma.crypto_ads.count({ where: filters });
        const page = Number(req.query.page) || 1;
        const skip = (page - 1) * perPage;

        let ads = await prisma.crypto_ads.findMany({
            where: filters,
            include: { user: true },
            orderBy: { crypto_ad_id: "desc" },
            skip,
            take: perPage,
        });

        ads = ads.map((ad) => ({
            ...ad,
            cryptocurrencyLogo: logo(ad.cryptocurrency),
            user: ad.user ? userDetails(ad.user, false) : null,
        }));

        return res.json({
            status: true,
            message: "Crypto advertisements fetched successfully.",
            data: ads,
            pagination: {
                current_page: page,
                from: skip + 1,
                to: skip + ads.length,
                total: totalAds,
                per_page: perPage,
                last_page: Math.ceil(totalAds / perPage),
                next_page_url: page < Math.ceil(totalAds / perPage) ? `?page=${page + 1}` : null,
                prev_page_url: page > 1 ? `?page=${page - 1}` : null,
            },
            analytics: totalCount(user_id ?? null, totalAds),
            logo: logo(),
        });

    } catch (err) {
        return res.status(500).json({
            status: false,
            message: "Something went wrong.",
            errors: err.message,
        });
    }
};




function logo(currency = null, req = null,) {
    const baseUrl = process.env.APP_URL;
    return currency ? `${baseUrl}/storage/images/crypto_logo/${currency}.png` : "/icons/default.png";
}

function userDetails(user) {
    return {
        user_id: user.user_id,
        name: user.name,
        username: user.username,
        username_changed: user.username_changed,
        email: user.email,
        dialing_code: user.dialing_code,
        phone_number: user.phone_number,
        email_verified: user.email_verified,
        phone_verified: user.phone_verified,
        id_verified: user.id_verified,
        address_verified: user.address_verified,
        twoFactorAuth: user.twoFactorAuth,
        profile_image_url: user.profile_image_url,
        country: user.country,
        country_code: user.country_code,
        city: user.city,
        country_flag_url: user.country_flag_url,
        preferred_currency: user.preferred_currency,
        preferred_timezone: user.preferred_timezone,
        bio: user.bio,
        login_with: user.login_with,
        login_status: user.login_status,
        last_login: user.last_login,
        last_seen_at: user.last_seen_at,
        last_login_duration: user.last_login_duration,
        user_status: user.user_status
    };
}

function totalCount(userId, count) {
    return {
        trader: userId,
        adsCount: count,
    };
}
