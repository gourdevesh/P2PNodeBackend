import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import dayjs from "dayjs";

const prisma = new PrismaClient();

export const verifyEmailOtp = async (req, res) => {
    const user = req.user;
    let { otp, operation } = req.body;

    try {
        // ✅ Default value
        operation = operation || "email_verification";

        // ✅ Validation
        if (!otp) {
            return res.status(422).json({
                status: false,
                message: "Validation failed",
                errors: { otp: "OTP is required" },
            });
        }

        if (!["email_verification", "two_fa", "login", "two_fa_disable"].includes(operation)) {
            return res.status(422).json({
                status: false,
                message: "Invalid operation type",
            });
        }
        console.log(otp, user.user_id)
        // ✅ Start transaction
        const result = await prisma.$transaction(async (tx) => {
            // ✅ Find OTP record
            const otpRecord = await tx.email_otps.findFirst({
                where: {
                    user_id: user.user_id,
                    otp: parseInt(otp),
                },
            });

            if (!otpRecord) {
                throw new Error("Invalid OTP");
            }

            // ✅ Check expiry
            if (dayjs(otpRecord.expires_at).isBefore(dayjs())) {
                throw new Error("OTP has expired");
            }

            // ✅ Delete OTP record after success
            await tx.email_otps.delete({
                where: { id: otpRecord.id },
            });

            // ✅ Handle operation
            switch (operation) {
                case "two_fa":
                    // You can add extra logic for enabling 2FA if needed
                    break;

                case "two_fa_disable":
                    // Handle disabling 2FA flow here if needed
                    break;

                case "login":
                    await tx.users.update({
                        where: { user_id: user.user_id },
                        data: { two_fa_otp_verified: true },
                    });

                    // If you store token_id in user_login_details
                    if (req.tokenId) {
                        await tx.user_login_details.updateMany({
                            where: {
                                user_id: user.user_id,
                                token_id: req.tokenId,
                            },
                            data: { two_fa_otp_verified: true },
                        });
                    }
                    break;

                case "email_verification":
                    const userRecord = await tx.users.findUnique({
                        where: { user_id: user.user_id },
                    });

                    const updateData = {
                        email_verified_at: new Date(),
                    };

                    // ✅ Update user level if all verified
                    if (userRecord.number_verified_at && userRecord.id_verified_at) {
                        updateData.user_level = 1;
                    }

                    await tx.users.update({
                        where: { user_id: user.user_id },
                        data: updateData,
                    });

                    // ✅ Add notification record
                    await tx.notifications.create({
                        data: {
                            user_id: user.user_id,
                            title: "Email verified successfully.",
                            message: "Congratulations, You have just confirmed your email.",
                            type: "account_activity",
                            is_read: false,
                        },
                    });
                    break;
            }

            return true;
        });

        if (result) {
            return res.status(200).json({
                status: true,
                message: "Email OTP verified successfully!",
            });
        }
    } catch (error) {
        console.error("verifyEmailOtp error:", error);
        if (error.message === "Invalid OTP" || error.message === "OTP has expired") {
            return res.status(400).json({
                status: false,
                message: error.message,
            });
        }
        return res.status(500).json({
            status: false,
            message: "Unable to verify email OTP.",
            errors: error.message,
        });
    }
};
