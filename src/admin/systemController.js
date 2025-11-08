import prisma from '../config/prismaClient.js';
import { convertBigIntToString } from "../config/convertBigIntToString.js";

export const getSettingData = async (req, res) => {
  try {

    const settingData = await prisma.settings.findUnique({
      where: { setting_id: BigInt(1) },
    });

    if (!settingData) {
      return res.status(200).json({
        status: true,
        message: 'No setting data found.',
        data: [],
      });
    }

    // ✅ updated_by parse karna
    let updatedByParsed = null;
    if (settingData.updated_by) {
      try {
        updatedByParsed = JSON.parse(settingData.updated_by);
      } catch (err) {
        console.error("JSON Parse Error:", err.message);
      }
    }

    let updatedByAdmin = null;
    if (updatedByParsed?.admin_id) {
      updatedByAdmin = await prisma.admins.findUnique({
        where: { admin_id: BigInt(updatedByParsed.admin_id) },
      });
    }

    const requiredData = {
      withdrawStatus: settingData.withdraw_status,
      depositStatus: settingData.deposit_status,
      withdrawType: settingData.withdraw_type,
      minWithdraw: settingData.min_withdraw,
      maxWithdraw: settingData.max_withdraw,
      trade_fee_type: settingData.trade_fee_type,
      trade_fee: settingData.trade_fee,
      user_registration: settingData.user_registration,
      updatedBy: updatedByAdmin || null,
    };

    // ✅ Final data BigInt-safe bana ke send karo
    const safeData = convertBigIntToString(requiredData);

    return res.status(200).json({
      status: true,
      message: 'Setting details fetched successfully.',
      data: safeData,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: 'Unable to fetch the setting details.',
      errors: error.message,
    });
  }
};
