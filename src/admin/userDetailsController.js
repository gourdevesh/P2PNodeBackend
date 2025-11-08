import prisma from '../config/prismaClient.js';
import { convertBigIntToString } from "../config/convertBigIntToString.js";
import { getCountryData } from '../config/getCountryData.js';

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);


export const getUser = async (req, res) => {
    const { id } = req.params;
    const admin = req.admin; // middleware se attach
    const ADMIN_TZ = admin?.preferred_timezone || "Asia/Kolkata";

    try {
        const user = await prisma.users.findUnique({
            where: { user_id: BigInt(id) },
            include: {
                user_login_details: true, // login history
                // address: true,             // addresses
            },
        });

        if (!user) {
            return res.status(404).json({
                status: false,
                message: "No user were found",
            });
        }

        // Profile image
        let profileImage = null;
        if (user.profile_image) {
            profileImage = user.profile_image.startsWith("http")
                ? user.profile_image
                : `${process.env.BASE_URL}/storage/${user.profile_image}`;
        }

        // KYC & verification
        const email_verified = Boolean(user.email_verified_at);
        const phone_verified = Boolean(user.number_verified_at);
        const kycVerified = user.address?.some(a => a.status === "verified");

        // Successful address
        const addressData = user.address?.find(a => a.status === "success") || null;

        // User object
        const userData = {
            user_id: user.user_id,
            name: user.name,
            username: user.username,
            email: user.email,
            dialing_code: user.dialing_code,
            phone_number: user.phone_number,
            email_verified,
            phone_verified,
            kyc_verified: kycVerified,
            profile_image_url: profileImage,
            country: user.country || null,
            preferred_currency: user.preferred_currency,
            preferred_timezone: user.preferred_timezone,
            login_with: user.login_with,
            login_status: user.login_status,
            login_count: user.login_count,
            last_login: user.last_login
                ? dayjs(user.last_login).tz(ADMIN_TZ).format("YYYY-MM-DD hh:mm A")
                : null,
            last_login_duration: user.last_login
                ? dayjs(user.last_login).fromNow()
                : null,
            logged_in_device: user.logged_in_device,
            loggedIn_device_ip: user.loggedIn_device_ip,
            user_status: user.user_status,
            joined_at: dayjs(user.created_at).tz(ADMIN_TZ).format("YYYY-MM-DD hh:mm A"),
            joined_duration: dayjs(user.created_at).fromNow(),
            last_seen_at: user.last_seen ? dayjs(user.last_seen).fromNow() : null,
        };

        // Login history
        let loginDetails = [];
        if (user.user_login_details?.length) {
            loginDetails = await Promise.all(
                user.user_login_details.map(async loginHistory => ({
                    loginDetailsId: loginHistory.login_details_id,
                    ipAddress: loginHistory.ip_address,
                    deviceDetails: loginHistory.device_details ? JSON.parse(loginHistory.device_details) : null,
                    device: loginHistory.device,
                    browser: loginHistory.browser,
                    os: loginHistory.os,
                    osVersion: loginHistory.os_version,
                    loginStatus: loginHistory.login_status,
                    loginAt: loginHistory.logged_in_at
                        ? dayjs(loginHistory.logged_in_at).tz(ADMIN_TZ).format("YYYY-MM-DD hh:mm A")
                        : null,
                    loginDuration: loginHistory.logged_in_at
                        ? dayjs(loginHistory.logged_in_at).fromNow()
                        : null,
                    countryData: await getCountryData(loginHistory.ip_address),
                }))
            );
        }
        const safeData = convertBigIntToString({
            user: userData,
            login_details: loginDetails,
            address: addressData,
        });



        return res.status(200).json({
            status: true,
            message: "User data fetched successfully",
            data: safeData,
            analytics: {
                deposits: admin.totalDeposit || 0,
                withdrawals: admin.totalWithdrawal || 0,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: false,
            message: "Something went wrong while fetching the user's details",
            errors: error.message,
        });
    }
};
