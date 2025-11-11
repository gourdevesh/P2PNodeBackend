import prisma from '../../config/prismaClient.js';
import { convertBigIntToString } from '../../config/convertBigIntToString.js';

export const updateNameUrlTitle = async (req, res) => {
    const admin = req.admin;
    const { name, url, title } = req.body;

    try {
        if (!name && !url && !title) {
            return res.status(422).json({
                status: false,
                message: 'Validation failed',
                errors: { fields: ['At least one field is required.'] },
            });
        }

        const websiteDetails = await prisma.website_details.findUnique({
            where: { website_details_id: 1 },
        });

        if (!websiteDetails) {
            return res.status(404).json({
                status: false,
                message: 'Website details not found.',
            });
        }

        // ✅ Prepare updatable data
        const updateData = {};
        if (name) updateData.website_name = name;
        if (url) updateData.website_url = url;
        if (title) updateData.website_title = title;

        // Store who updated (optional)
        updateData.updated_by = JSON.stringify(admin || {});

        // ✅ Update record
        await prisma.website_details.update({
            where: { website_details_id: 1 },
            data: updateData,
        });

        return res.status(200).json({
            status: true,
            message: 'Website details have been updated successfully.',
        });

    } catch (error) {
        console.error('Error updating website details:', error);
        return res.status(500).json({
            status: false,
            message: 'Unable to update the setting.',
            errors: error.message,
        });
    }
};

export const getWebsiteDetails = async (req, res) => {
  try {
    const websiteDetails = await prisma.website_details.findUnique({
      where: { website_details_id: BigInt(1)}, 
      select: {
        website_details_id: true,
        website_name: true,
        website_url: true,
        website_title: true,
        updated_by: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!websiteDetails) {
      return res.status(404).json({
        status: false,
        message: 'Website details not found.',
      });
    }
    const safeData = convertBigIntToString(websiteDetails);

    return res.status(200).json({
      status: true,
      message: 'Website details fetched successfully.',
      data: safeData,
    });

  } catch (error) {
    console.error('Error fetching website details:', error);
    return res.status(500).json({
      status: false,
      message: 'Unable to fetch website details.',
      errors: error.message,
    });
  }
};