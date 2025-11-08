import prisma from '../config/prismaClient.js';
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { convertBigIntToString } from "../config/convertBigIntToString.js";

dayjs.extend(utc);
dayjs.extend(timezone);
function diffForHumans(date) {
    const now = dayjs().tz("Asia/Kolkata");
    const then = dayjs(date).tz("Asia/Kolkata");

    const years = now.diff(then, "year");
    if (years > 0) return `${years} year${years > 1 ? "s" : ""} ago`;

    const months = now.diff(then, "month");
    if (months > 0) return `${months} month${months > 1 ? "s" : ""} ago`;

    const days = now.diff(then, "day");
    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;

    const hours = now.diff(then, "hour");
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;

    const minutes = now.diff(then, "minute");
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;

    return "just now";
}


// Enable the relativeTime plugin
dayjs.extend(relativeTime);


export const getAllUsersTickets = async (req, res) => {
    try {
        const user = req.user; // middleware से आया हुआ logged-in user
        const perPage = parseInt(req.query.per_page) || 10;
        const page = parseInt(req.query.page) || 1;

        // Base query
        let whereCondition = {};

        // ✅ Filter fields
        const filterFields = ["user_id", "status", "ticket_id", "ticket_number"];
        filterFields.forEach((field) => {
            if (req.query[field]) {
                whereCondition[field] = req.query[field];
            }
        });

        // ✅ Total tickets
        const totalTickets = await prisma.support_tickets.count();

        // ✅ Analytics count by status
        const statuses = ["open", "pending", "in_progress", "closed"];
        const analytics = {
            total_tickets: totalTickets,
        };

        for (const status of statuses) {
            analytics[`total_${status}_tickets`] = await prisma.support_tickets.count({
                where: { status },
            });
        }

        // ✅ Total filtered tickets
        const totalFilteredTickets = await prisma.support_tickets.count({
            where: whereCondition,
        });
        analytics.total_filtered_tickets = totalFilteredTickets;

        // ✅ Fetch filtered + paginated data
        const tickets = await prisma.support_tickets.findMany({
            where: whereCondition,
            include: {
                user: true,
            },
            orderBy: { ticket_id: "desc" },
            skip: (page - 1) * perPage,
            take: perPage,
        });

        // ✅ Add user_details manually (optional)
        const formattedTickets = tickets.map((ticket) => ({
            ...ticket,
            user_details: ticket.user
                ? {
                    id: ticket.user.user_id,
                    name: ticket.user.name,
                    email: ticket.user.email,
                    phone_number: ticket.user.phone_number,
                }
                : null,
        }));

        // ✅ Pagination info
        const pagination = {
            current_page: page,
            per_page: perPage,
            total: totalFilteredTickets,
            last_page: Math.ceil(totalFilteredTickets / perPage),
            from: (page - 1) * perPage + 1,
            to: Math.min(page * perPage, totalFilteredTickets),
            next_page_url:
                page < Math.ceil(totalFilteredTickets / perPage)
                    ? `?page=${page + 1}&per_page=${perPage}`
                    : null,
            prev_page_url: page > 1 ? `?page=${page - 1}&per_page=${perPage}` : null,
        };
        const safeData = convertBigIntToString(formattedTickets);

        // ✅ Final Response
        return res.status(200).json({
            status: true,
            message: "Support tickets retrieved successfully.",
            data: safeData,
            pagination,
            analytics,
        });
    } catch (error) {
        return res.status(500).json({
            status: false,
            message: "Failed to retrieve support tickets.",
            errors: error.message,
        });
    }
};
export const getParticularTicket = async (req, res) => {
    try {
        const { id } = req.params;

        const ticket = await prisma.support_tickets.findUnique({
            where: { ticket_id: BigInt(id) },
            include: {
                support_ticket_messages: {
                    include: { sender: true }, // include full sender object like Laravel
                    orderBy: { stm_id: "desc" },
                },
                user: true, // include full user object like Laravel
            },
        });

        if (!ticket) {
            return res.status(400).json({
                status: false,
                message: "Provide a valid ticket id.",
            });
        }

        // Update status if pending
        if (ticket.status === "pending") {
            await prisma.support_tickets.update({
                where: { ticket_id: BigInt(id) },
                data: { status: "open" },
            });
            ticket.status = "open";
        }
        const createdDuration = diffForHumans(ticket.created_at);

        // Add created_duration to ticket
        const responseTicket = {
            ...ticket,
            created_duration: createdDuration,
        };

        // Convert BigInt to string for IDs
        const data = convertBigIntToString(responseTicket);

        return res.status(200).json({
            status: true,
            message: "Particular Support ticket retrieved successfully.",
            data,
        });

    } catch (error) {
        return res.status(500).json({
            status: false,
            message: "Failed to retrieve particular ticket.",
            errors: error.message,
        });
    }
};

