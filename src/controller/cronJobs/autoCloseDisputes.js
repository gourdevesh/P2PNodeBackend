import cron from "node-cron";
import prisma from "../prismaClient.js";
import { sendTradeEmail } from "../emails/sendTradeEmail.js";

async function autoCloseDisputes() {
  console.log("⏳ Checking disputes for auto-close...");

  // 48 hours old disputes
  const oldDisputes = await prisma.support_tickets.findMany({
    where: {
      status: "pending",
      created_at: {
        lte: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    },
    include: {
      user: true,
      trades: true,
    }
  });

  for (let ticket of oldDisputes) {

    const trade = ticket.trades[0];

    // Update ticket
    await prisma.support_tickets.update({
      where: { ticket_id: ticket.ticket_id },
      data: { status: "closed" }
    });

    // EMAIL → "Dispute Auto Closed"
    await sendTradeEmail("DISPUTE_AUTO_CLOSED", ticket.user.email, {
      user_name: ticket.user.name,
      trade_id: trade.trade_id,
      platform_name: "Your Platform"
    });

    console.log(`✔️ Auto closed ticket #${ticket.ticket_id}`);
  }
}

// Run every 30 minutes
cron.schedule("*/30 * * * *", autoCloseDisputes);

export default autoCloseDisputes;
