import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import prisma from "../../config/prismaClient.js";
import timezone from "dayjs/plugin/timezone.js";
import path from 'path';
import fs from 'fs';
import { trades_trade_step } from "@prisma/client";
import { userDetails } from "./CryptoAdController.js";
import { cryptoAsset, fullAssetName, getCurrentTimeInKolkata, network, userDetail } from "../../config/ReusableCode.js";
import moment from "moment";

dayjs.extend(utc);
dayjs.extend(timezone);


export const initiateTrade = async (req, res) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({
      status: false,
      message: "User not found",
    });
  }

  try {
    const { ad_id, amount, currency, assetValue, trade_type } = req.body;

    if (!ad_id || !amount || !trade_type) {
      return res.status(422).json({
        status: false,
        message: "Validation failed",
        errors: "ad_id, amount and trade_type are required",
      });
    }

    const tradeType = trade_type.toLowerCase();
    if (!["buy", "sell"].includes(tradeType)) {
      return res.status(422).json({
        status: false,
        message: "Validation failed",
        errors: "trade_type must be buy or sell",
      });
    }

    const userCurrency = (currency && currency.toLowerCase()) || user.preferred_currency || "inr";

    // Find crypto ad
    const cryptoAd = await prisma.crypto_ads.findUnique({
      where: { crypto_ad_id: BigInt(ad_id) },
    });
    if (!cryptoAd) throw new Error("Crypto offer not found.");
    if (cryptoAd.user_id === user.user_id) throw new Error("You cannot trade with your own offer.");
    if (!cryptoAd.is_active) throw new Error("The selected crypto offer is not activated.");
    console.log("cryptoAd", cryptoAd)
    const asset = cryptoAd.cryptocurrency;

    console.log("asset", asset)

    if (cryptoAd.transaction_type === tradeType) {
      throw new Error(`Invalid ${tradeType} trade type`);
    }

    if ((user.two_fa_set || []).includes(tradeType)) {
      return res.status(200).json({
        status: true,
        message: "To continue, please complete two-factor authentication.",
        twoFactorAction: true,
      });
    }
    const whereQuery = { asset: cryptoAd.cryptocurrency };

    if (cryptoAd.network) {
      whereQuery.network = cryptoAd.network;
    }
    // Admin asset validation
    const mainAdminAssetDetails = await prisma.admin_assets.findFirst({
      where: whereQuery,

    });
    if (!mainAdminAssetDetails) throw new Error("Asset not found.");
    if (mainAdminAssetDetails.status !== "active") {
      throw new Error("You cannot make transaction because address is not active.");
    }

    const timeLimit = dayjs().tz("Asia/Kolkata").add(cryptoAd.offer_time_limit, "minute").toDate();
    const payment = {
      payment_type: cryptoAd.payment_type,
      payment_method: JSON.parse(cryptoAd.payment_method || "[]"),
    };

    const tradeAmount = Number(amount);
    const assetValueFinal = Number(assetValue) || 0;
    console.log(cryptoAd)
    console.log(tradeAmount)


    if (tradeAmount < cryptoAd.min_trade_limit) throw new Error("You cannot trade below allowed limit.");
    if (tradeAmount > cryptoAd.max_trade_limit) throw new Error("You cannot trade above allowed limit.");

    const tradeCount = await prisma.trades.count({
      where: {         initiated_by: Number(user.user_id)
 },
    });
    if (cryptoAd.min_trade_requirement && tradeCount < cryptoAd.min_trade_requirement) {
      throw new Error(`The minimum ${cryptoAd.min_trade_requirement} trade is required for this offer.`);
    }
    if (tradeCount === 0 && cryptoAd.new_user_limit && tradeAmount < cryptoAd.new_user_limit) {
      throw new Error(`The minimum ${cryptoAd.new_user_limit} is required for new user to trade.`);
    }

    const buyerUserId = tradeType === "sell" ? cryptoAd.user_id : user.user_id;
    const sellerUserId = tradeType === "sell" ? user.user_id : cryptoAd.user_id;

    const sellerWalletDetails = await prisma.web3_wallets.findFirst({
      where: {
        user_id: BigInt(sellerUserId)
        // asset
      },
    });
    if (!sellerWalletDetails) throw new Error("Wallet Details not found.");
    if (Number(sellerWalletDetails.remaining_amount) - Number(sellerWalletDetails.hold_asset) < assetValueFinal) {
      throw new Error("Insufficient amount in seller's account.");
    }

    // Update cryptoAd remaining trade limit
    await prisma.crypto_ads.update({
      where: { crypto_ad_id: cryptoAd.crypto_ad_id },
      data: {
        remaining_trade_limit: Number(cryptoAd.remaining_trade_limit) - tradeAmount,
        is_accepted: true,
      },
    });

    // Create trade
    const tradeData = await prisma.trades.create({
      data: {
        initiated_by: Number(user.user_id),
        crypto_ad_id: cryptoAd.crypto_ad_id.toString(),
        trade_type,
        trade_step: trades_trade_step.ONE, // use enum value, not "1" or "step1"
        seller_id: sellerUserId.toString(),
        asset,
        amount: tradeAmount,
        price: Number(cryptoAd.price),
        payment: JSON.stringify(payment),
        time_limit: timeLimit,
        hold_asset: assetValueFinal,
        buyer_id: buyerUserId.toString(),
        buy_amount: tradeAmount,
        buy_value: assetValueFinal,
        status_changed_at: new Date(),
      },
    });

    // Update seller wallet hold_asset
    await prisma.web3_wallets.update({
      where: { wallet_id: sellerWalletDetails.wallet_id },
      data: { hold_asset: Number(sellerWalletDetails.hold_asset) + assetValueFinal },
    });

    // Create notifications
    await prisma.notifications.createMany({
      data: [
        {
          user_id: sellerUserId,
          title: `New Sell Trade Initiated: Action Required.`,
          message: `A new sell trade has been initiated for your cryptocurrency ad. Please review the details and confirm the transaction.`,
          operation_type: "sell_trade",
            operation_id: tradeDetails.trade_id.toString(), // convert BigInt -> String
          type: "trade",
          is_read: false,
        },
        {
          user_id: buyerUserId,
          title: "Buy trade Initiated.",
          message: `Your buy trade has been successfully initiated. Please make the payment and upload the payment details to receive ${assetValueFinal} ${asset}.`,
          operation_type: "buy_trade",
            operation_id: tradeDetails.trade_id.toString(), // convert BigInt -> String
          type: "trade",
          is_read: false,
        },
      ],
    });

    return res.status(201).json({
      status: true,
      message: `${tradeType} trade successfully initiated.`,
      data: tradeData.trade_id,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Unable to initiate trade.",
      errors: error.message,
      twoFactorAction: false,
    });
  }
};

export const getTradeHistory = async (req, res) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ status: false, message: "User not found" });
  }

  try {
    const perPage = Number(req.query.per_page) || 10;
    const page = Number(req.query.page) || 1;
    const skip = (page - 1) * perPage;

    let userId = user.user_id.toString();
    if (req.query.user_id) {
      userId = req.query.user_id.toString();
    }

    // Base filter for trades where user is buyer or seller
    const baseFilter = {
      OR: [
        { seller_id: userId },
        { buyer_id: userId },
      ],
    };

    // Additional filters
    if (req.query.trade_id) baseFilter.trade_id = BigInt(req.query.trade_id);
    if (req.query.cryptocurrency) baseFilter.asset = req.query.cryptocurrency;
    if (req.query.tradeStatus) baseFilter.trade_status = req.query.tradeStatus;
    if (req.query.tradeType) baseFilter.trade_type = req.query.tradeType;

    // Count total trades
    const totalTrade = await prisma.trades.count({
      where: { OR: [{ seller_id: userId }, { buyer_id: userId }] },
    });

    // Count filtered trades
    const totalFilteredTrade = await prisma.trades.count({ where: baseFilter });

    // Fetch trades with pagination
    const trades = await prisma.trades.findMany({
      where: baseFilter,
      orderBy: { trade_id: "desc" },
      skip,
      take: perPage,
    });

    // Format trades
    const formattedTrades = trades.map(trade => ({
      ...trade,
      payment: trade.payment ? JSON.parse(trade.payment) : null,
      review: trade.review ? JSON.parse(trade.review) : null,
      role: trade.buyer_id === userId ? "buyer" : "seller",
      amount: trade.amount ? Number(trade.amount) : null,
      buy_amount: trade.buy_amount ? Number(trade.buy_amount) : null,
      buy_value: trade.buy_value ? Number(trade.buy_value) : null,
      hold_asset: trade.hold_asset ? Number(trade.hold_asset) : null,
    }));

    const totalPages = Math.ceil(totalFilteredTrade / perPage);

    const pagination = {
      current_page: page,
      from: skip + 1,
      to: skip + formattedTrades.length,
      total: totalFilteredTrade,
      first_page_url: `${req.baseUrl}?page=1&per_page=${perPage}`,
      last_page: totalPages,
      last_page_url: `${req.baseUrl}?page=${totalPages}&per_page=${perPage}`,
      next_page_url: page < totalPages ? `${req.baseUrl}?page=${page + 1}&per_page=${perPage}` : null,
      prev_page_url: page > 1 ? `${req.baseUrl}?page=${page - 1}&per_page=${perPage}` : null,
      per_page: perPage,
    };

    return res.status(200).json({
      status: true,
      message: "Trade history fetched successfully.",
      datas: formattedTrades,
      pagination,
      analytics: {
        totalTrade,
        totalFilteredTrade,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: "Unable to fetch trade history.",
      errors: error.message,
    });
  }
};

export const giveFeedback = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ status: false, message: "User not found" });
    }

    // Parse like to boolean
    const like = req.body?.like === true || req.body?.like === "true";
    const { trade_id, review } = req.body;
    if (!trade_id || typeof like !== "boolean") {
      return res.status(422).json({
        status: false,
        message: "Validation failed",
        errors: "trade_id and like are required and like must be boolean",
      });
    }

    // Find trade
    const tradeDetails = await prisma.trades.findUnique({
      where: { trade_id: BigInt(trade_id) },
    });

    if (!tradeDetails) {
      return res.status(404).json({
        status: false,
        message: "Trade not found for the given trade id",
      });
    }

    if (tradeDetails.trade_status !== "success") {
      return res.status(403).json({
        status: false,
        message: "Trade is not available for feedback",
      });
    }

    // Determine feedback direction
    const feedbackFrom = tradeDetails.buyer_id === user.user_id.toString() ? "buyer" : "seller";
    const feedbackToId =
      feedbackFrom === "buyer" ? tradeDetails.seller_id : tradeDetails.buyer_id;

    // Update trade review JSON
    const tradeReview = tradeDetails.review ? JSON.parse(tradeDetails.review) : {};
    tradeReview[feedbackFrom] = {
      like,
      review: review ?? null,
    };

    await prisma.trades.update({
      where: { trade_id: BigInt(trade_id) },
      data: { review: JSON.stringify(tradeReview) },
    });

    // Check if feedback already exists
    const feedbackDetails = await prisma.feedback.findFirst({
      where: {
        trade_id: Number(trade_id),
        feedback_from_id: Number(user.user_id),
      },
    });

    if (feedbackDetails) {
      // Update existing feedback
      await prisma.feedback.update({
        where: { feedback_id: feedbackDetails.feedback_id },
        data: {
          like,
          dislike: !like,
          review: review ?? null,
        },
      });
    } else {
      // Create new feedback
      await prisma.feedback.create({
        data: {
          user_id: BigInt(feedbackToId),
          trade_id: Number(trade_id),
          feedback_from: feedbackFrom,
          feedback_from_id: Number(user.user_id),
          like,
          dislike: !like,
          review: review ?? null,
          created_at: new Date(),
          updated_at: new Date()
        },
      });
    }

    return res.status(feedbackDetails ? 200 : 201).json({
      status: true,
      message: `Feedback ${feedbackDetails ? "updated" : "submitted"} successfully.`,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: "Failed to submit feedback.",
      errors: error.message,
    });
  }
};
// Helper function similar to Laravel's userDetails


export const getTradeFeedback = async (req, res) => {
  try {
    const tradeId = req.query.trade_id || req.body.trade_id;
    if (!tradeId)
      return res.status(422).json({ status: false, message: "Trade not found" });

    const tradeDetails = await prisma.trades.findUnique({
      where: { trade_id: BigInt(tradeId) },
    });
    if (!tradeDetails)
      return res.status(422).json({ status: false, message: "Trade not found" });

    // Fetch feedbacks
    const feedbackFromBuyer = await prisma.feedback.findFirst({
      where: {
        trade_id: Number(tradeId),
        feedback_from_id: Number(tradeDetails.buyer_id),
      },
    });

    const feedbackFromSeller = await prisma.feedback.findFirst({
      where: {
        trade_id: Number(tradeId),
        feedback_from_id: Number(tradeDetails.seller_id),
      },
    });

    // Attach user details
    const attachUserDetails = async (feedback) => {
      if (!feedback) return null;
      const user = await prisma.users.findUnique({
        where: { user_id: BigInt(feedback.feedback_from_id) },
      });
      return {
        ...feedback,
        like: feedback.like ? 1 : 0,
        dislike: feedback.dislike ? 1 : 0,
        feedback_id: feedback.feedback_id.toString(),
        userDetails: userDetail(user)
      };
    };

    return res.status(200).json({
      status: true,
      message: "Feedback retrieved successfully.",
      data: {
        feedbackFromBuyer: await attachUserDetails(feedbackFromBuyer),
        feedbackFromSeller: await attachUserDetails(feedbackFromSeller),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Failed to get feedback.",
      errors: error.message,
    });
  }
};

export const updateTradeFeedback = async (req, res) => {
  try {
    const user = req.user; // Assuming user is attached via middleware
    const { trade_id, like, review } = req.body;

    if (!trade_id || typeof like === "undefined") {
      return res.status(422).json({
        status: false,
        message: "Trade ID and like are required.",
      });
    }

    const tradeDetails = await prisma.trades.findUnique({
      where: { trade_id: BigInt(trade_id) },
    });

    if (!tradeDetails) {
      return res.status(422).json({
        status: false,
        message: "Trade not found for the given trade id.",
      });
    }

    const feedbackFrom = tradeDetails.buyer_id === user.user_id ? "buyer" : "seller";
    const feedbackToId = feedbackFrom === "buyer" ? tradeDetails.seller_id : tradeDetails.buyer_id;

    // Find existing feedback
    let feedbackDetails = await prisma.feedback.findFirst({
      where: {
        trade_id: Number(trade_id),
        feedback_from_id: Number(user.user_id),
      },
    });

    // Update trade review JSON
    const tradeReview = tradeDetails.review ? JSON.parse(tradeDetails.review) : {};
    tradeReview[feedbackFrom] = {
      like: Boolean(like),
      review: review ?? null,
    };
    await prisma.trades.update({
      where: { trade_id: BigInt(trade_id) },
      data: { review: JSON.stringify(tradeReview) },
    });

    if (feedbackDetails) {
      // Update existing feedback
      feedbackDetails = await prisma.feedback.update({
        where: { feedback_id: feedbackDetails.feedback_id },
        data: {
          like: Boolean(like),
          dislike: !like,
          review: review ?? null,
          updated_at: new Date()
        },
      });
    } else {
      // Create new feedback
      feedbackDetails = await prisma.feedback.create({
        data: {
          user_id: BigInt(feedbackToId),
          trade_id: Number(trade_id),
          feedback_from: feedbackFrom,
          feedback_from_id: Number(user.user_id),
          like: Boolean(like),
          dislike: !like,
          review: review ?? null,
          created_at: new Date(),
          updated_at: new Date()
        },
      });
    }

    return res.status(200).json({
      status: true,
      message: "Feedback updated successfully.",
      data: feedbackDetails,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Failed to update feedback.",
      errors: error.message,
    });
  }
};



export const cancelTrade = async (req, res) => {
  try {
    const user = req.user; // user attached via middleware
    const { trade_id } = req.body;

    // ----------------------
    // Validation
    // ----------------------
    if (!trade_id) {
      return res.status(422).json({
        status: false,
        message: "Trade ID is required.",
      });
    }

    const tradeExists = await prisma.trades.findUnique({
      where: { trade_id: BigInt(trade_id) },
    });
    if (!tradeExists) {
      return res.status(422).json({
        status: false,
        message: "Trade not found for the given trade id.",
      });
    }

    // ----------------------
    // Start Transaction
    // ----------------------
    await prisma.$transaction(async (tx) => {
      const tradeDetails = await tx.trades.findUnique({
        where: { trade_id: BigInt(trade_id) },
      });

      if (tradeDetails.trade_status === "cancel") {
        throw { code: 403, message: "Trade is already cancelled." };
      }

      if (BigInt(tradeDetails.buyer_id) !== BigInt(user.user_id)) {
        throw { code: 403, message: "Only the buyer can cancel the trade." };
      }

      if (tradeDetails.trade_step >= 3) {
        throw { code: 403, message: "You cannot cancel the trade at this stage." };
      }

      // ----------------------
      // Fetch seller wallet
      // ----------------------
      const sellerWallet = await tx.web3_wallets.findFirst({
        where: { user_id: BigInt(tradeDetails.seller_id) },
      });
      if (!sellerWallet) throw new Error("Seller's web3 wallet details not found.");

      // ----------------------
      // Fetch crypto ad
      // ----------------------
      const cryptoAd = await tx.crypto_ads.findUnique({
        where: { crypto_ad_id: tradeDetails.crypto_ad_id },
      });
      if (!cryptoAd) throw new Error("Crypto Ad not found.");

      const hasUnsuccessfulTrade = await tx.trades.findFirst({
        where: {
          crypto_ad_id: tradeDetails.crypto_ad_id,
          trade_id: { not: BigInt(tradeDetails.trade_id) },
          trade_status: { not: "success" },
        },
      });

      const now = getCurrentTimeInKolkata();

      // ----------------------
      // Handle expired trade
      // ----------------------



      const timeLimit = tradeDetails.time_limit
        ? moment(tradeDetails.time_limit).tz("Asia/Kolkata").toDate()
        : null;


      if (tradeDetails.trade_status === "expired" || (timeLimit && new Date(tradeDetails.time_limit) < timeLimit.getTime())) {
        if (tradeDetails.trade_status !== "expired") {
          await tx.trades.update({
            where: { trade_id: BigInt(tradeDetails.trade_id) },
            data: {
              trade_status: "expired",
              trade_remark: "Trade time limit expired.",
              time_limit: null,
              hold_asset: tradeDetails.trade_step < 2 ? 0 : tradeDetails.hold_asset,
            },
          });

          if (tradeDetails.trade_step < 2) {
            await tx.web3_wallets.update({
              where: { id: sellerWallet.id },
              data: { hold_asset: sellerWallet.hold_asset - tradeDetails.hold_asset },
            });

            await tx.crypto_ads.update({
              where: { crypto_ad_id: cryptoAd.crypto_ad_id },
              data: { remaining_trade_limit: cryptoAd.remaining_trade_limit + tradeDetails.amount },
            });
          }
        }

        if (!hasUnsuccessfulTrade) {
          await tx.crypto_ads.update({
            where: { crypto_ad_id: cryptoAd.crypto_ad_id },
            data: { is_accepted: false },
          });
        }

        throw { code: 400, message: "Trade has expired and cannot be cancelled." };
      }
      console.log(sellerWallet)
      //   Update trade, wallet, and crypto ad for cancellation
      await tx.web3_wallets.update({
        where: { wallet_id: sellerWallet.wallet_id },
        data: { hold_asset: sellerWallet.hold_asset - tradeDetails.hold_asset },
      });

      await tx.crypto_ads.update({
        where: { crypto_ad_id: cryptoAd.crypto_ad_id },
        data: {
          remaining_trade_limit: cryptoAd.remaining_trade_limit + tradeDetails.amount,
          is_accepted: hasUnsuccessfulTrade ? cryptoAd.is_accepted : false,
        },
      });

      await tx.trades.update({
        where: { trade_id: BigInt(tradeDetails.trade_id) },
        data: {
          hold_asset: 0,
          trade_status: "cancel",
          buyer_status: "cancel",
          status_changed_at: now,
          time_limit: null,
        },
      });

      const sellerDetails = await tx.users.findUnique({
        where: { user_id: BigInt(tradeDetails.seller_id) },
      });

      const cryptoSymbol = tradeDetails.asset.toUpperCase();
      const cryptoAmount = tradeDetails.hold_asset ? tradeDetails.hold_asset.toString() : "0";

      // Notifications
      await tx.notifications.createMany({
        data: [
          {
            user_id: BigInt(tradeDetails.seller_id),
            title: "Trade Cancelled by Buyer",
            message: `The trade with buyer ${user.username} for ${cryptoAmount} ${cryptoSymbol} has been cancelled by the buyer.`,
            operation_type: "sell_trade",
            operation_id: tradeDetails.trade_id.toString(), // convert BigInt -> String
            type: "trade",
            is_read: false,
          },
          {
            user_id: BigInt(user.user_id),
            title: "You Cancelled the Trade",
            message: `You have successfully cancelled the trade with seller ${sellerDetails.username} for ${cryptoAmount} ${cryptoSymbol}.`,
            operation_type: "buy_trade",
            operation_id: tradeDetails.trade_id.toString(), // convert BigInt -> String
            type: "trade",
            is_read: false,
          },
        ],
      });

    });

    return res.status(200).json({ status: true, message: "Trade cancelled successfully." });
  } catch (error) {
    const code = error.code || 500;
    const message = error.message || "Failed to cancel trade.";
    console.log("Error caught:", error); // <-- show Laravel-style error in console
    return res.status(code).json({ status: false, message, errors: message });
  }
};


export const updateDispute = async (req, res) => {
  const { trade_id, support_ticket_number } = req.body;

  try {
    // ==========================
    // VALIDATION
    if (!trade_id || !support_ticket_number) {
      return res.status(422).json({
        status: false,
        message: "Validation failed.",
        errors: {
          trade_id: !trade_id ? ["trade_id is required"] : undefined,
          support_ticket_number: !support_ticket_number ? ["support_ticket_number is required"] : undefined,
        }
      });
    }

    // ==========================
    // CHECK TRADE EXISTS
    // ==========================
    const tradeDetails = await prisma.trades.findUnique({
      where: { trade_id: BigInt(trade_id) }
    });

    if (!tradeDetails) {
      return res.status(422).json({
        status: false,
        message: "Validation failed.",
        errors: {
          trade_id: ["Trade not found for the given trade id."]
        }
      });
    }

    // ==========================
    // CHECK SUPPORT TICKET EXISTS
    // ==========================
    const ticketExists = await prisma.support_tickets.findUnique({
      where: { ticket_number: support_ticket_number }
    });

    if (!ticketExists) {
      return res.status(422).json({
        status: false,
        message: "Validation failed.",
        errors: {
          support_ticket_number: ["Support ticket not found."]
        }
      });
    }

    // ==========================
    // CHECK IF ALREADY DISPUTED
    // ==========================
    if (tradeDetails.is_disputed) {
      return res.status(409).json({
        status: false,
        message: "Trade is already disputed."
      });
    }

    // ==========================
    // TRANSACTION UPDATE
    // ==========================
    const updatedTrade = await prisma.$transaction(async (tx) => {
      return await tx.trades.update({
        where: { trade_id: BigInt(trade_id) },
        data: {
          support_ticket_number,
          is_disputed: true,
          updated_at: new Date(),
        }
      });
    });

    return res.status(200).json({
      status: true,
      message: "Trade Dispute updated successfully.",
      is_disputed: updatedTrade.is_disputed,
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Failed to update.",
      errors: error.message
    });
  }
};




export const buyerUpdateTrade = async (req, res) => {
  const user = req.user; // assume auth middleware sets this
  const { trade_id } = req.body;
  const paymentFile = req.file; // multer middleware for 'image' field

  let paymentDetailsPath = null;

  try {
    // Validation
    if (!trade_id) {
      return res.status(422).json({
        status: false,
        message: 'trade_id is required.'
      });
    }

    const tradeDetails = await prisma.trades.findFirst({
      where: {
        buyer_id: user.user_id.toString(),
        trade_id: trade_id.toString()
      }
    });

    if (!tradeDetails) {
      return res.status(422).json({
        status: false,
        message: 'Trade not found.'
      });
    }

    if (tradeDetails.trade_status === 'cancel') {
      return res.status(422).json({
        status: false,
        message: 'Trade has been cancelled.'
      });
    }

    if (tradeDetails.trade_step < 1) {
      return res.status(422).json({
        status: false,
        message: 'Trade is not initiated successfully.'
      });
    }

    if (tradeDetails.trade_step > 1) {
      return res.status(422).json({
        status: false,
        message: 'You have already completed this step. Please wait for the seller to respond.'
      });
    }

    // Begin transaction
    const tx = await prisma.$transaction(async (prismaTx) => {

      const cryptoAd = await prismaTx.crypto_ads.findFirst({
        where: { user_id: BigInt(tradeDetails.seller_id), crypto_ad_id: BigInt(tradeDetails.crypto_ad_id) }
      });

      if (!cryptoAd) throw new Error('Crypto Ad not found.');

      // Check time limit
      if (tradeDetails.time_limit && dayjs(tradeDetails.time_limit).isBefore(dayjs().tz('Asia/Kolkata'))) {
        // Expire trade
        await prismaTx.trades.update({
          where: { trade_id: BigInt(tradeDetails.trade_id) },
          data: { trade_status: 'expired', trade_remark: 'Trade time limit expired.' }
        });

        // Adjust seller wallet and cryptoAd if needed
        const sellerWallet = await prismaTx.web3_wallets.findFirst({
          where: { user_id: BigInt(tradeDetails.seller_id), asset: tradeDetails.asset }
        });
        if (sellerWallet) {
          await prismaTx.web3_wallets.update({
            where: { wallet_id: sellerWallet.wallet_id },
            data: { hold_asset: sellerWallet.hold_asset - tradeDetails.hold_asset }
          });
        }

        await prismaTx.crypto_ads.update({
          where: { crypto_ad_id: BigInt(tradeDetails.crypto_ad_id) },
          data: { remaining_trade_limit: cryptoAd.remaining_trade_limit + tradeDetails.amount }
        });

        throw new Error('Trade time limit expired.');
      }

      // Handle payment image upload
      if (paymentFile) {
        const ext = path.extname(paymentFile.originalname);
        const filename = `${user.user_id}_${dayjs().tz('Asia/Kolkata').format('DDMMYYYYHHmmss')}_${Math.random().toString(36).substring(2, 5)}${ext}`;
        const uploadPath = path.join('storage/app/public/images/payment_details', filename);

        fs.mkdirSync(path.dirname(uploadPath), { recursive: true });

        // Move uploaded file from temp path to final path
        fs.renameSync(paymentFile.path, uploadPath);

        paymentDetailsPath = `${process.env.APP_URL}/storage/images/payment_details/${filename}`;
      }

      console.log(paymentDetailsPath)
      // Update trade
      await prismaTx.trades.update({
        where: { trade_id: BigInt(tradeDetails.trade_id) },
        data: {
          payment_details: paymentDetailsPath,
          buyer_status: 'processing',
          trade_status: 'processing',
          buyer_dispute_time: dayjs().tz('Asia/Kolkata').add(3, 'minute').toDate(),
          seller_dispute_time: dayjs().tz('Asia/Kolkata').add(1, 'minute').toDate(),
          trade_step: "TWO",
          time_limit: null,
          paid_at: dayjs().tz('Asia/Kolkata').toDate(),
          status_changed_at: dayjs().tz('Asia/Kolkata').toDate(),
          updated_at: new Date()
        }
      });

      // Notify seller
      const seller = await prismaTx.users.findUnique({ where: { user_id: BigInt(tradeDetails.seller_id) } });
      if (!seller) throw new Error('Seller not found.');

      await prismaTx.notifications.create({
        data: {
          user_id: BigInt(tradeDetails.seller_id),
          title: 'Payment Confirmed.',
          message: 'The buyer has completed their payment. Please review the payment and confirm the transaction.',
          operation_type: 'sell_trade',
          operation_id: tradeDetails.trade_id.toString(),
          type: 'trade',
          is_read: false
        }
      });

      // Send email to seller
      // sendEmail({
      //   user_id: seller.user_id,
      //   email: seller.email,
      //   template: 'transaction-pending',
      //   template_data: { transaction_id: tradeDetails.trade_id.toString(), date: dayjs().toISOString() }
      // });

      return true;
    }); // transaction end

    return res.status(200).json({
      status: true,
      message: 'Trade updated successfully.'
    });

  } catch (err) {
    // Delete uploaded file if failed
    if (paymentDetailsPath && fs.existsSync(paymentDetailsPath)) {
      fs.unlinkSync(paymentDetailsPath);
    }

    return res.status(500).json({
      status: false,
      message: 'Unable to update trade.',
      errors: err.message
    });
  }
};


export const sellerUpdateTrade = async (req, res) => {
  const user = req.user; // Logged in user (seller)

  try {
    // ===============================
    // VALIDATION
    // ===============================
    const { trade_id, response, chat } = req.body;

    if (!trade_id || isNaN(trade_id)) {
      return res.status(422).json({
        status: false,
        message: "Validation failed.",
        errors: { trade_id: ["Trade not found for given trade id"] }
      });
    }

    if (!["success", "reject"].includes(response)) {
      return res.status(422).json({
        status: false,
        message: "response must be success or reject"
      });
    }

    // ===============================
    // Trade Found?
    // ===============================
    const tradeDetails = await prisma.trades.findFirst({
      where: {
        seller_id: String(user.user_id),
        trade_id: Number(trade_id)
      }
    });
    console.log("tradeDetails", tradeDetails)

    if (!tradeDetails) {
      return res.status(404).json({
        status: false,
        message: "Trade not found"
      });
    }

    // Cancel Check
    if (tradeDetails.trade_status === "cancel") {
      return res.status(422).json({
        status: false,
        message: "Trade has been cancelled."
      });
    }

    if (tradeDetails.trade_step < 2) {
      return res.status(422).json({
        status: false,
        message: "No payment confirmation from buyer."
      });
    }

    if (tradeDetails.trade_step > 2) {
      return res.status(422).json({
        status: false,
        message: "Step already completed. Wait for final update."
      });
    }

    // ===============================
    // Start Transaction
    // ===============================
    await prisma.$transaction(async (tx) => {

      const mainAdminAssetDetails = await tx.admin_assets.findFirst({
        where: {
          asset: tradeDetails.asset,
          network: fullAssetName(tradeDetails.asset)
        }
      });

      if (!mainAdminAssetDetails)
        throw new Error("Asset not found.");

      if (mainAdminAssetDetails.status !== "active")
        throw new Error("Address is not active.");

      // Update Trade
      const avgMin =
        Math.floor((Date.now() - new Date(tradeDetails.created_at)) / 60000);

      await tx.trades.update({
        where: { trade_id: BigInt(trade_id) },
        data: {
          seller_status: response,
          buyer_status: response,
          trade_status: response,
          trade_remark:
            response === "reject"
              ? "Trade rejected by seller."
              : "Trade successfully completed.",
          avg_trade_time: `${avgMin} min`,
          chat: chat || null,
          trade_step: "THREE",
          status_changed_at: new Date()
        }
      });

      // Update Crypto Ad
      const cryptoAd = await tx.crypto_ads.findFirst({
        where: { crypto_ad_id: tradeDetails.crypto_ad_id }
      });

      let tradeTimes = await tx.trades.findMany({
        where: {
          crypto_ad_id: String(cryptoAd.crypto_ad_id),
          trade_id: { not: BigInt(trade_id) }
        },
        select: { avg_trade_time: true }
      });

      tradeTimes.push({ avg_trade_time: `${avgMin} min` });

      const total = tradeTimes.reduce(
        (sum, t) => sum + parseInt(t.avg_trade_time),
        0
      );

      const newAvg = Math.floor(total / tradeTimes.length);

      await tx.crypto_ads.update({
        where: { crypto_ad_id: cryptoAd.crypto_ad_id },
        data: {
          avg_time: `${newAvg} min`,
          is_accepted: response === "success" ? false : true
        }
      });

      const buyerDetails = await tx.users.findFirst({
        where: { user_id: BigInt(tradeDetails.buyer_id) }
      });

      if (!buyerDetails) throw new Error("Buyer not found.");

      // ===============================
      // SUCCESS = process wallet
      // ===============================
      if (response === "success") {
        const sellerWallet = await tx.web3_wallets.findFirst({
          where: {
            user_id: tradeDetails.seller_id,
            asset: cryptoAsset(tradeDetails.asset),
            network: network(tradeDetails.asset)
          }
        });

        if (!sellerWallet) throw new Error("Seller wallet not found");

        const buyerWallet = await tx.web3_wallets.findFirst({
          where: {
            user_id: tradeDetails.buyer_id,
            asset: cryptoAsset(tradeDetails.asset),
            network: network(tradeDetails.asset)
          }
        });

        if (!buyerWallet) throw new Error("Buyer wallet not found");

        // Seller Wallet Update
        const sellerRemaining = sellerWallet.remaining_amount - tradeDetails.hold_asset;

        await tx.transactions.create({
          data: {
            user_id: tradeDetails.seller_id,
            txn_type: "internal",
            from_address: sellerWallet.wallet_address,
            to_address: buyerWallet.wallet_address,
            txn_hash_id: genTxnHash(tradeDetails.seller_id),
            asset: sellerWallet.asset,
            network: sellerWallet.network,
            available_amount: sellerWallet.remaining_amount,
            debit_amount: tradeDetails.hold_asset,
            credit_amount: 0,
            remaining_amount: sellerRemaining,
            method: "send",
            status: "success",
            remark: "By selling the asset",
date_time: String(Date.now())
          }
        });

        await tx.web3_wallets.update({
          where: { wallet_id: BigInt(sellerWallet.wallet_id) },
          data: {
            withdrawal_amount: sellerWallet.withdrawal_amount + tradeDetails.hold_asset,
            remaining_amount: sellerRemaining,
            hold_asset: sellerWallet.hold_asset - tradeDetails.hold_asset
          }
        });

        // Buyer Fee Calculation
        const { transferFee, transferPercentage } = feeDetails(
          mainAdminAssetDetails.withdrawal_fee_type,
          mainAdminAssetDetails.withdrawal_fee,
          tradeDetails.hold_asset
        );

        const paidAmount = tradeDetails.hold_asset - transferFee;

        // Update Admin Revenue
        await tx.admin_assets.update({
          where: { admin_asset_id: mainAdminAssetDetails.admin_asset_id },
          data: { total_revenue: mainAdminAssetDetails.total_revenue + transferFee }
        });

        // Buyer Wallet update
        const buyerRemaining = buyerWallet.remaining_amount + paidAmount;

        await tx.transactions.create({
          data: {
            user_id: BigInt(tradeDetails.buyer_id),
            txn_type: "internal",
            from_address: sellerWallet.wallet_address,
            to_address: buyerWallet.wallet_address,
            txn_hash_id: genTxnHash(tradeDetails.buyer_id),
            asset: buyerWallet.asset,
            network: buyerWallet.network,
            credit_amount: tradeDetails.hold_asset,
            debit_amount: 0,
            transfer_fee: transferFee,
            transfer_percentage: transferPercentage,
            paid_amount: paidAmount,
            available_amount: buyerWallet.remaining_amount,
            remaining_amount: buyerRemaining,
            method: "receive",
            status: "success",
            remark: "By buying the asset",
            date_time: String(Date.now())

          }
        });

        await tx.web3_wallets.update({
          where: { wallet_id: BigInt(buyerWallet.wallet_id) },
          data: {
            deposit_amount: buyerWallet.deposit_amount + paidAmount,
            remaining_amount: buyerRemaining,
            internal_deposit: buyerWallet.internal_deposit + paidAmount
          }
        });
      }

      // Notifications
      await tx.notifications.create({
        data: {
          user_id: BigInt(tradeDetails.seller_id),
          title: response === "success" ? "Trade Completed" : "Trade Rejected",
          message:
            response === "success"
              ? "Your sell trade has been completed."
              : "You have rejected the trade.",
          operation_type: "sell_trade",
            operation_id: tradeDetails.trade_id.toString(), // convert BigInt -> String
          type: "trade",
          is_read: false
        }
      });

      await tx.notifications.create({
        data: {
          user_id: BigInt(tradeDetails.buyer_id),
          title: response === "success" ? "Trade Completed" : "Trade Rejected",
          message:
            response === "success"
              ? "Your buy trade has been completed successfully."
              : "Trade has been rejected by seller.",
          operation_type: "buy_trade",
            operation_id: tradeDetails.trade_id.toString(), // convert BigInt -> String
          type: "trade",
          is_read: false
        }
      });
    });

    return res.json({
      status: true,
      message: "Trade updated and completed successfully."
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Unable to update trade.",
      errors: err.message
    });
  }
};


export const tradeExpired = async (req, res) => {
  const user = req.user; // logged-in user

  try {
    const { trade_id } = req.body;

    // ============================
    // VALIDATION
    if (!trade_id || isNaN(trade_id)) {
      return res.status(422).json({
        status: false,
        message: "Validation failed.",
        errors: { trade_id: ["Trade not found for the given trade id."] }
      });
    }

    // ============================
    // FETCH TRADE
    const tradeDetails = await prisma.trades.findFirst({
      where: { trade_id: Number(trade_id) }
    });

    if (!tradeDetails) {
      return res.status(404).json({
        status: false,
        message: "Trade not found."
      });
    }

    // ============================
    // CHECK STATUS + STEP
    if (tradeDetails.trade_status !== "pending" && tradeDetails.trade_step === "ONE") {
      return res.status(422).json({
        status: false,
        message: "You can not mark this trade to expired." // Because amount was paid
      });
    }

    // ============================
    // AUTHORIZATION CHECK
    if (
      String(tradeDetails.seller_id) !== String(user.user_id) &&
      String(tradeDetails.buyer_id) !== String(user.user_id)
    ) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to access this trade."
      });
    }

    // ============================
    // EXPIRY TIME CHECK
    const now = new Date(); // server time (convert if needed)

    if (tradeDetails.time_limit && new Date(tradeDetails.time_limit) > now) {
      return res.status(400).json({
        status: false,
        message: "Trade is not expired yet."
      });
    }

    // ============================
    // UPDATE TRADE
    await prisma.trades.update({
      where: { trade_id: Number(trade_id) },
      data: {
        trade_status: "expired",
        trade_remark: "Trade time limit expired.",
        time_limit: null,
        status_changed_at: new Date()
      }
    });

    return res.status(200).json({
      status: true,
      message: "Trade has been marked as expired."
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Unable to mark trade as expired.",
      errors: err.message
    });
  }
};

export const authenticatedUserTradeHistory = async (req, res) => {
  const user = req.user;

  try {
    const perPage = Number(req.query.per_page) || 10;
    const page = Number(req.query.page) || 1;

    // ============================
    // BASE QUERY
    // ============================
    let filters = {
        initiated_by: Number(user.user_id)

    };

    // Filters (tradeStatus, tradeType)
    if (req.query.tradeStatus) {
      filters.trade_status = req.query.tradeStatus;
    }

    if (req.query.tradeType) {
      filters.trade_type = req.query.tradeType;
    }

    // ============================
    // COUNT BEFORE FILTER
    // ============================
    const totalTrade = await prisma.trades.count({
      where: {         initiated_by: Number(user.user_id)
 }
    });

    // ============================
    // COUNT AFTER FILTER
    // ============================
    const totalFilteredTrade = await prisma.trades.count({
      where: filters
    });

    // ============================
    // PAGINATION
    // ============================
    const skip = (page - 1) * perPage;

    let tradeHistories = await prisma.trades.findMany({
      where: filters,
      orderBy: { trade_id: "desc" },
      skip,
      take: perPage
    });

    // ============================
    // FORMAT & PARTNER DETAILS
    tradeHistories = await Promise.all(
      tradeHistories.map(async (trade) => {
        trade.payment = trade.payment ? JSON.parse(trade.payment) : null;
        trade.review = trade.review ? JSON.parse(trade.review) : null;

        const partnerId =
          trade.trade_type === "buy" ? trade.seller_id : trade.buyer_id;

        const partnerDetails = await prisma.users.findFirst({
          where: { user_id: BigInt(partnerId) }
        });

        trade.partner_details = partnerDetails
          ? {
              user_id: BigInt(partnerDetails.user_id),
              name: partnerDetails.name,
              email: partnerDetails.email,
              mobile: partnerDetails.mobile,
              username: partnerDetails.username
            }
          : null;

        return trade;
      })
    );

    // ============================
    // PAGINATION RESPONSE FORMAT
    // ============================
    const pagination = {
      current_page: page,
      per_page: perPage,
      total: totalFilteredTrade,
      last_page: Math.ceil(totalFilteredTrade / perPage),
      next_page_url:
        page < Math.ceil(totalFilteredTrade / perPage)
          ? `?page=${page + 1}&per_page=${perPage}`
          : null,
      prev_page_url:
        page > 1 ? `?page=${page - 1}&per_page=${perPage}` : null,
      from: skip + 1,
      to: skip + tradeHistories.length
    };

    return res.status(200).json({
      status: true,
      message: "Trade history fetched successfully.",
      data: tradeHistories,
      pagination,
      analytics: {
        totalTrade,
        totalFilteredTrade
      }
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Unable to fetch trade history.",
      errors: err.message
    });
  }
};


const genTxnHash = (userId) => {
  // simple txn hash generator - replace with your real one
  return `${userId}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

const parseMinutesFromAvg = (avgStr) => {
  if (!avgStr) return 0;
  const num = parseInt(String(avgStr).split(' ')[0], 10);
  return isNaN(num) ? 0 : num;
};

const feeDetails = (feeType, feeValue, amount) => {
  // placeholder: implement your real fee logic
  let transferFee = 0;
  let transferPercentage = 0;
  if (feeType === 'fixed') {
    transferFee = Number(feeValue || 0);
    transferPercentage = 0;
  } else if (feeType === 'percent') {
    transferPercentage = Number(feeValue || 0);
    transferFee = (transferPercentage / 100) * Number(amount || 0);
  }
  return { transferFee, transferPercentage };
};