import moment from "moment";

export const getCryptoLogo = (cryptocurrency = null, req) => {
  try {
    // Base folder for static images
    const baseUrl = `${req.protocol}://${req.get("host")}/storage/images/crypto_logo`;

    const cryptoAsset = {
      bitcoin: "bitcoin-logo.png",
      ethereum: "ethereum-logo.png",
      binance: "binance-logo.png",
      tether: "tether-logo.png",
    };

    // Return a single logo
    if (cryptocurrency) {
      const logoFileName = cryptoAsset[cryptocurrency];
      if (!logoFileName) return null;
      return `${baseUrl}/${logoFileName}`;
    }

    // Return ALL logos
    return {
      bitcoinLogo: `${baseUrl}/bitcoin.png`,
      binanceLogo: `${baseUrl}/binance.png`,
      ethereumLogo: `${baseUrl}/ethereum.png`,
      tetherLogo: `${baseUrl}/tether.png`,
    };

  } catch (error) {
    throw new Error(`Logo generation failed: ${error.message}`);
  }
};

export function userDetail(user) {
    return {
        user_id: user.user_id,
        name: user.name,
        username: user.username,
        username_changed: user.username_changed,
        email: user.email,
        dialing_code: user.dialing_code,
        phone_number: user.phone_number,
        email_verified: user.email_verified,
        phone_verified: user.phone_verified,
        id_verified: user.id_verified,
        address_verified: user.address_verified,
        twoFactorAuth: user.twoFactorAuth,
        profile_image_url: user.profile_image_url,
        country: user.country,
        country_code: user.country_code,
        city: user.city,
        country_flag_url: user.country_flag_url,
        preferred_currency: user.preferred_currency,
        preferred_timezone: user.preferred_timezone,
        bio: user.bio,
        login_with: user.login_with,
        login_status: user.login_status,
        last_login: user.last_login,
        last_seen_at: user.last_seen_at,
        last_login_duration: user.last_login_duration,
        user_status: user.user_status
    };
}


export const getCurrentTimeInKolkata = () => {
  return moment.tz("Asia/Kolkata").toDate();
};
