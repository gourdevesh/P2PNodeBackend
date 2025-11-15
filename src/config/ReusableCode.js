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
