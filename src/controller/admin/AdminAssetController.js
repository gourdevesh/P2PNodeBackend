import { convertBigIntToString } from "../../config/convertBigIntToString.js";
import prisma from "../../config/prismaClient.js";
export const getAdminAssets = async (req, res) => {
    try {
        const admin = req.admin; // set by middleware (authenticated admin)
        if (!admin) {
            return res.status(401).json({
                status: false,
                message: "Admin not authenticated",
            });
        }

        const { asset, network } = req.query;

        // Build where condition dynamically
        const whereClause = {
            admin_id: BigInt(admin.admin_id),
            ...(asset ? { asset } : {}),
            ...(network ? { network } : {}),
        };

        // Fetch admin assets
        const adminAssets = await prisma.admin_assets.findMany({
            where: whereClause,
        });

        // Format response data
        const requiredData = adminAssets.map((adminAsset) => ({
            admin_id: adminAsset.admin_id,
            asset: adminAsset.asset,
            asset_ticker: adminAsset.asset_ticker,
            blockchain: adminAsset.blockchain,
            network: adminAsset.network,
            wallet_address: adminAsset.wallet_address,
            wallet_key: adminAsset.wallet_key,
            contract_address: adminAsset.contract_address,
            total_deposit: adminAsset.total_deposit,
            total_withdraw: adminAsset.total_withdraw,
            available_balance: adminAsset.available_balance,
            withdrawal_fee_type: adminAsset.withdrawal_fee_type,
            withdrawal_fee: adminAsset.withdrawal_fee,
            total_revenue: adminAsset.total_revenue,
            withdrawal_type: adminAsset.withdrawal_type,
            status: adminAsset.status,
            conversion_fee_type: adminAsset.conversion_fee_type,
            conversion_fee: adminAsset.conversion_fee,
            last_updated_by: adminAsset.last_updated_by
                ? JSON.parse(adminAsset.last_updated_by)
                : null,
        }));
        const safeData = convertBigIntToString(requiredData);

        return res.status(200).json({
            status: true,
            message: "Admin assets fetched successfully",
            data: safeData,
        });
    } catch (error) {
        console.error("Error fetching admin assets:", error);
        return res.status(500).json({
            status: false,
            message: "Unable to fetch admin assets",
            error: error.message,
        });
    }
};
