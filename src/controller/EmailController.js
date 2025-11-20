import nodemailer from "nodemailer";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

dotenv.config();

export const sendWelcomeEmail = async (req, res) => {
    try {
        const user = req.user; // token se
        const userData = await prisma.users.findUnique({
            where: { user_id: BigInt(user.user_id) }
        });

        if (!userData) {
            return res.status(404).json({
                status: false,
                message: "User not found"
            });
        }

        const subject = "Welcome to Our OnnBit Platform";
        const message = "Thank you for registering with us.";

        const details = {
            name: userData.name + '!',
            email: userData.email,
            phone_number: userData.phone_number || ""
        };

        // 👉 Template call
        const emailContent = welcomeEmailTemplate(subject, message, details);

        // 👉 Email transport
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.MAIL_FROM_ADDRESS,
                pass: process.env.MAIL_PASSWORD
            }
        });

        // 👉 Send email
        await transporter.sendMail({
            from: process.env.MAIL_FROM_ADDRESS,
            to: userData.email,
            subject: emailContent.subject,
            html: emailContent.html
        });

        return res.json({
            status: true,
            message: "Email sent successfully"
        });

    } catch (error) {
        return res.status(500).json({
            status: false,
            message: "Failed to send email",
            errors: error.message
        });
    }
};
export const welcomeEmailTemplate = (subject, message, details) => {
    return {
        subject: subject,
        html: `
        <h2>Hello, ${details.name}</h2>
        <p>${message}</p>
        <p>Email: ${details.email}</p>
        <br><br>
        <p>Best Regards,</p>
        <p>ONNBIT</p>
        <hr>
        <p><a href="https://test.onnbit.com/">ONNBIT</a></p>
    `
    };
};
