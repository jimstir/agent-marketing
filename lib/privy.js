export function getWalletAddress(user, wallets = []) {
  const connectedWallet = wallets.find((wallet) => wallet.address)?.address;
  if (connectedWallet) {
    return connectedWallet.toLowerCase();
  }

  if (user?.wallet?.address) {
    return user.wallet.address.toLowerCase();
  }

  const linkedWallet = user?.linkedAccounts?.find(
    (account) => account.type === "wallet" && account.address
  );

  return linkedWallet?.address?.toLowerCase() || "";
}
