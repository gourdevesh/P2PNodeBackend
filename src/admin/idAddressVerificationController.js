import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import prisma from '../config/prismaClient.js';
import { convertBigIntToString } from "../config/convertBigIntToString.js";



dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);



export const getAddressVerificationDetails = async (req, res) => {
  try {
    const perPage = parseInt(req.query.per_page) || 10;
    const page = parseInt(req.query.page) || 1;
    const { user_id, status } = req.query;

    // Base query
    let whereClause = {};
    if (user_id) whereClause.user_id = Number(user_id);
    if (status) whereClause.status = status;

    // Analytics
    const totalAddressVerification = await prisma.address_verifications.count();
    const totalPending = await prisma.address_verifications.count({ where: { status: "pending" } });
    const totalVerified = await prisma.address_verifications.count({ where: { status: "verified" } });
    const totalRejected = await prisma.address_verifications.count({ where: { status: "reject" } });
    const totalFilteredData = await prisma.address_verifications.count({ where: whereClause });

    // Pagination & Fetch
    const addressDetails = await prisma.address_verifications.findMany({
      where: whereClause,
      orderBy: { addVer_id: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    // Format images and duration
    const formattedDetails = addressDetails.map((item) => ({
      ...item,
      document_front_image: item.document_front_image
        ? `${process.env.BASE_URL}/storage/${item.document_front_image}`
        : null,
      document_back_image: item.document_back_image
        ? `${process.env.BASE_URL}/storage/${item.document_back_image}`
        : null,
      duration: dayjs(item.created_at).tz("Asia/Kolkata").fromNow(), // like diffForHumans
    }));

    // Pagination metadata
    const pagination = {
      current_page: page,
      per_page: perPage,
      total: totalFilteredData,
      last_page: Math.ceil(totalFilteredData / perPage),
      from: (page - 1) * perPage + 1,
      to: (page - 1) * perPage + formattedDetails.length,
    };
const safeData = convertBigIntToString(formattedDetails);
    return res.status(200).json({
      status: true,
      message: "Address verification details fetched successfully.",
      data: safeData,
      pagination,
      analytics: {
        total_address_verification: totalAddressVerification,
        total_pending: totalPending,
        total_verified: totalVerified,
        total_rejected: totalRejected,
        total_filtered_data: totalFilteredData,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Unable to fetch the address verification details.",
      errors: error.message,
    });
  }
};

export const getIdVerificationDetails = async (req, res) => {
  try {
    const perPage = parseInt(req.query.per_page) || 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * perPage;

    const filters = {};
    if (req.query.user_id) filters.user_id = Number(req.query.user_id);
    if (req.query.status) filters.status = req.query.status;

    // Total counts
    const totalIdVerification = await prisma.addresses.count();
    const totalPending = await prisma.addresses.count({ where: { status: "pending" } });
    const totalVerified = await prisma.addresses.count({ where: { status: "verified" } });
    const totalRejected = await prisma.addresses.count({ where: { status: "reject" } });

    // Filtered count
    const totalFilteredData = await prisma.addresses.count({ where: filters });

    // Paginated data
    const idDetailsRaw = await prisma.addresses.findMany({
      where: filters,
      orderBy: { address_id: "desc" },
      skip,
      take: perPage,
    });

    // Format data (images + duration)
    const BASE_URL = process.env.BASE_URL || "https://api.onnbit.com"; // set your API base URL
    const idDetails = idDetailsRaw.map(item => ({
      ...item,
      document_front_image: item.document_front_image ? `${BASE_URL}/storage/${item.document_front_image}` : null,
      document_back_image: item.document_back_image ? `${BASE_URL}/storage/${item.document_back_image}` : null,
      duration: dayjs(item.created_at).fromNow(),
    }));

    // Pagination object
    const pagination = {
      current_page: page,
      per_page: perPage,
      total: totalFilteredData,
      last_page: Math.ceil(totalFilteredData / perPage),
      from: skip + 1,
      to: skip + idDetails.length,
    };
const safeData = convertBigIntToString(idDetails);
    return res.status(200).json({
      status: true,
      message: "ID verification details fetched successfully.",
      data: safeData,
      pagination,
      analytics: {
        total_id_verification: totalIdVerification,
        total_pending: totalPending,
        total_verified: totalVerified,
        total_rejected: totalRejected,
        total_filtered_data: totalFilteredData,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Unable to fetch the id verification details.",
      errors: error.message,
    });
  }
};