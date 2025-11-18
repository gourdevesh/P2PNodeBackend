import { generateUniqueTicketNumber } from "../../config/generateTicketNumber.js";
import prisma from "../../config/prismaClient.js";
import fs from "fs";

export const storeTicket = async (req, res) => {
    const user = req.user; // from auth middleware
    const { subject, message, priority } = req.body;
    const attachments = req.files || [];

    try {
        // ==============================
        // VALIDATION — SAME AS LARAVEL
        // ==============================
        const errors = {};

        if (!subject) errors.subject = ["Subject is required."];
        if (!message) errors.message = ["Message is required."];
        if (priority && !["low", "medium", "high"].includes(priority)) {
            errors.priority = ["Invalid priority (low, medium, high only)."];
        }
        if (attachments.length > 5) {
            errors.attachments = ["You can upload max 5 attachments."];
        }

        if (Object.keys(errors).length > 0) {
            return res.status(422).json({
                status: false,
                message: "Validation failed",
                errors,
            });
        }

        // ==============================
        // TOTAL SIZE LIMIT (100 MB)
        // ==============================
        let totalSize = 0;
        attachments.forEach((file) => (totalSize += file.size));

        if (totalSize > 100 * 1024 * 1024) {
            return res.status(422).json({
                status: false,
                message: "Validation failed",
                errors: { attachments: ["Total attachment size cannot exceed 100MB."] },
            });
        }

        // ==============================
        // PROCESS ATTACHMENTS
        // ==============================
        const uploadedPaths = attachments.map((file) => file.path);
        const BASE_URL = process.env.APP_URL;

        const finalUrls = attachments.map(file => {

            let clean = file.path
                .replace(/\\/g, "/")
                .replace("storage/app/public/", "storage/");
            return `${BASE_URL}/${clean}`;
        });


        // ==============================
        // GENERATE UNIQUE TICKET NUMBER
        // ==============================
        const ticketNumber = await generateUniqueTicketNumber();

        // ==============================
        // TRANSACTION START
        // ==============================
        const result = await prisma.$transaction(async (tx) => {
            // CREATE TICKET
            const ticket = await tx.support_tickets.create({
                data: {
                    ticket_number: ticketNumber,
                    user_id: BigInt(user.user_id),
                    subject,
                    priority: priority || "medium",
                    status: "pending",
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });

            // ADD FIRST MESSAGE
            await tx.support_ticket_messages.create({
                data: {
                    ticket_id: ticket.ticket_id,
                    sender_type: "user",
                    sender_id: BigInt(user.user_id),
                    message,
                    attachments: JSON.stringify(finalUrls), // save as string
                    created_at: new Date(),
                    updated_at: new Date()
                },
            });

            return ticket;
        });

        // ==============================
        // SEND NOTIFICATION (Pseudo)
        // ==============================
        // await sendNotification(user.user_id, ...)

        // ==============================
        // SEND EMAIL (Pseudo)
        // ==============================
        // await sendEmail(user.email, ...)

        return res.status(201).json({
            status: true,
            message: "Support ticket submitted successfully.",
            data: result,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: false,
            message: "Failed to raise support ticket. Please try again later.",
            errors: error.message,
        });
    }
};

export const getTickets = async (req, res) => {
    try {
        const user = req.user; // logged-in user (from middleware)

        const { ticket_id, ticket_number } = req.query;

        // ==============================
        // BASE QUERY
        // ==============================
        let whereClause = {
            user_id: BigInt(user.user_id),
        };

        // Filter by ticket_id
        if (ticket_id) {
            whereClause.ticket_id = BigInt(ticket_id);
        }

        // Filter by ticket_number (LIKE %search%)
        if (ticket_number) {
            whereClause.ticket_number = {
                contains: ticket_number,
            };
        }

        // ==============================
        // FETCH TICKETS WITH RELATIONS
        // ==============================
        const tickets = await prisma.support_tickets.findMany({
            where: whereClause,
            include: {
                support_ticket_messages: {
                    include: {
                        sender: true, // same as ->with('messages.sender')
                    },
                },
            },
            orderBy: {
                ticket_id: "desc",
            },
        });

        return res.status(200).json({
            status: true,
            message: "Support tickets retrieved successfully.",
            data: tickets,
            analytics: {
                totalSupportTicket: tickets.length,
            },
        });
    } catch (error) {
        console.error("GET TICKETS ERROR:", error);
        return res.status(500).json({
            status: false,
            message: "Failed to retrieve support tickets.",
            errors: error.message,
        });
    }
};


export const getParticularTickets = async (req, res) => {
    const { id } = req.params; // ticket_number
    const user = req.user;     // from auth middleware

    try {
        // ============================
        // Find ticket by ticket_number
        // ============================
        const ticket = await prisma.support_tickets.findFirst({
            where: {
                ticket_number: id,
                user_id: BigInt(user.user_id),
            },
            include: {
                support_ticket_messages: {
                    include: {
                        sender: true,
                    },
                },
            },
        });

        if (!ticket) {
            return res.status(400).json({
                status: false,
                message: "Provide a valid ticket id.",
            });
        }

        // Convert attachments JSON string → array
        ticket.support_ticket_messages =
            ticket.support_ticket_messages.map((msg) => ({
                ...msg,
                attachments: msg.attachments
                    ? JSON.parse(msg.attachments)
                    : [],
            }));

        return res.status(200).json({
            status: true,
            message: "Particular Support ticket retrieved successfully.",
            data: ticket,
        });

    } catch (error) {
        return res.status(500).json({
            status: false,
            message: "Failed to retrieve particular ticket.",
            errors: error.message,
        });
    }
};

export const replySupportTicket = async (req, res) => {
  const user = req.user; // from auth middleware
  const { ticket_id, message } = req.body;
  const attachments = req.files || []; // Multer uploaded files

  try {
    // ================================
    // VALIDATION 
    // ================================
    const errors = {};

    if (!ticket_id) errors.ticket_id = ["ticket_id is required"];
    if (!message) errors.message = ["message is required"];

    if (attachments.length > 5) {
      errors.attachments = ["You can upload max 5 attachments"];
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        status: false,
        message: "Validation failed.",
        errors,
      });
    }

    // ================================
    // Check Support Ticket Exists
    // ================================
    const supportTicket = await prisma.support_tickets.findUnique({
      where: { ticket_id: BigInt(ticket_id) },
    });

    if (!supportTicket) {
      return res.status(400).json({
        status: false,
        message: "Support ticket not found for the given ticket id.",
      });
    }

    // ================================
    // TOTAL SIZE LIMIT 100MB
    // ================================
    let totalSize = 0;
    attachments.forEach((file) => (totalSize += file.size));

    if (totalSize > 100 * 1024 * 1024) {
      return res.status(422).json({
        status: false,
        message: "Validation failed.",
        errors: {
          attachments: ["Total attachment size cannot exceed 100MB."],
        },
      });
    }

    // ================================
    // PROCESS UPLOADED FILES
    // ================================
    const APP_URL = process.env.APP_URL;

    const finalUrls = attachments.map((file) => {
      let clean = file.path
        .replace(/\\/g, "/")              // Fix Windows slashes
        .replace("storage/app/public/", "storage/"); // remove extra parts

      return `${APP_URL}/${clean}`;
    });

    // ================================
    // SAVE DATA IN TRANSACTION
    // ================================
    await prisma.$transaction(async (tx) => {
      // Insert new message
      await tx.support_ticket_messages.create({
        data: {
          ticket_id: BigInt(ticket_id),
          sender_type: "user",
          sender_id: BigInt(user.user_id),
          message,
          attachments: JSON.stringify(finalUrls),
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      // Update ticket status
      await tx.support_tickets.update({
        where: { ticket_id: BigInt(ticket_id) },
        data: { status: "in_progress" }, 
      });
    });

    return res.status(200).json({
      status: true,
      message: "Successfully replied to the support ticket.",
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: "Failed to reply to the support ticket.",
      errors: error.message,
    });
  }
};

export const closeTicket = async (req, res) => {
  const user = req.user; // logged-in user
  const { ticket_id } = req.body;

  try {
    // ============================
    // VALIDATION 
    // ============================
    const errors = {};

    if (!ticket_id) {
      errors.ticket_id = ["ticket_id is required"];
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        status: false,
        message: "Validation failed",
        errors,
      });
    }

    // ============================
    // CHECK IF TICKET EXISTS
    // AND BELONGS TO THIS USER
    // ============================
    const ticket = await prisma.support_tickets.findFirst({
      where: {
        ticket_id: BigInt(ticket_id),
        user_id: BigInt(user.user_id),
      },
    });

    if (!ticket) {
      return res.status(400).json({
        status: false,
        message: "Provide a valid ticket id.",
      });
    }

    // ============================
    // UPDATE STATUS TO CLOSED
    // ============================
    await prisma.support_tickets.update({
      where: { ticket_id: BigInt(ticket_id) },
      data: { status: "closed" },
    });

    return res.status(200).json({
      status: true,
      message: "Support ticket closed successfully.",
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Failed to close the support ticket.",
      errors: error.message,
    });
  }
};
