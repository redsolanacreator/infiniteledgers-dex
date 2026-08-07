import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import {
  BECH32_PREFIX,
  CHAIN_ID,
  GAS_PRICE_STEP,
  NATIVE_DECIMALS,
  NATIVE_DENOM,
  NATIVE_SYMBOL,
  REST_ENDPOINT,
  RPC_ENDPOINT,
} from "../config/chain";

export type WalletId = "keplr" | "leap" | "cosmostation";

export const SUPPORTED_WALLETS: { id: WalletId; label: string }[] = [
  { id: "keplr", label: "Keplr" },
  { id: "leap", label: "Leap" },
  { id: "cosmostation", label: "Cosmostation" },
];

export class WalletNotFoundError extends Error {
  constructor(public walletId: WalletId) {
    super(`${walletId} extension not found`);
  }
}

// Keplr, Leap, and Cosmostation all implement the same window-injected
// interface (this is the de facto Cosmos wallet standard Keplr defined
// and the others adopted) -- experimentalSuggestChain / enable /
// getOfflineSigner / getKey all share the same signature across all
// three. That's what lets this be one shared code path instead of three
// separate integrations.
interface InjectedCosmosWallet {
  experimentalSuggestChain: (chainInfo: unknown) => Promise<void>;
  enable: (chainId: string) => Promise<void>;
  getOfflineSigner: (chainId: string) => OfflineSigner;
  getKey: (chainId: string) => Promise<{ bech32Address: string; name: string }>;
}

function getInjectedWallet(id: WalletId): InjectedCosmosWallet | undefined {
  const w = window as any;
  switch (id) {
    case "keplr":
      return w.keplr;
    case "leap":
      return w.leap;
    case "cosmostation":
      // Cosmostation exposes a Keplr-compatible surface under providers.keplr.
      return w.cosmostation?.providers?.keplr;
    default:
      return undefined;
  }
}

export function isWalletInstalled(id: WalletId): boolean {
  return !!getInjectedWallet(id);
}

// Chain suggestion payload (Keplr-compatible ChainInfo). Passed to
// experimentalSuggestChain so a wallet that doesn't already know about
// infiniteledgers-1 can add it without the user hand-editing a custom
// endpoint. Gas price step is an ASSUMPTION -- see config/chain.ts.
function buildSuggestChainInfo() {
  return {
    chainId: CHAIN_ID,
    chainName: "Infinite Ledgers",
    rpc: RPC_ENDPOINT,
    rest: REST_ENDPOINT,
    bip44: { coinType: 118 },
    bech32Config: {
      bech32PrefixAccAddr: BECH32_PREFIX,
      bech32PrefixAccPub: `${BECH32_PREFIX}pub`,
      bech32PrefixValAddr: `${BECH32_PREFIX}valoper`,
      bech32PrefixValPub: `${BECH32_PREFIX}valoperpub`,
      bech32PrefixConsAddr: `${BECH32_PREFIX}valcons`,
      bech32PrefixConsPub: `${BECH32_PREFIX}valconspub`,
    },
    currencies: [
      {
        coinDenom: NATIVE_SYMBOL,
        coinMinimalDenom: NATIVE_DENOM,
        coinDecimals: NATIVE_DECIMALS,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: NATIVE_SYMBOL,
        coinMinimalDenom: NATIVE_DENOM,
        coinDecimals: NATIVE_DECIMALS,
        gasPriceStep: GAS_PRICE_STEP,
      },
    ],
    stakeCurrency: {
      coinDenom: NATIVE_SYMBOL,
      coinMinimalDenom: NATIVE_DENOM,
      coinDecimals: NATIVE_DECIMALS,
    },
    features: ["cosmwasm"],
  };
}

export interface WalletSession {
  walletId: WalletId;
  address: string;
  offlineSigner: OfflineSigner;
  signingClient: SigningCosmWasmClient;
}

/**
 * Connect to a wallet extension. Signing always happens inside the
 * extension itself -- this app never sees or holds a private key, only
 * the resulting OfflineSigner handle the extension provides and the
 * public address it reports.
 */
export async function connectWallet(id: WalletId): Promise<WalletSession> {
  const provider = getInjectedWallet(id);
  if (!provider) throw new WalletNotFoundError(id);

  try {
    await provider.experimentalSuggestChain(buildSuggestChainInfo());
  } catch (e) {
    // Some wallets no-op or reject suggestChain if the chain is already
    // known; that's fine, fall through to enable().
  }

  await provider.enable(CHAIN_ID);
  const offlineSigner = provider.getOfflineSigner(CHAIN_ID);
  const accounts = await offlineSigner.getAccounts();
  if (!accounts[0]) throw new Error("Wallet returned no accounts");

  const signingClient = await SigningCosmWasmClient.connectWithSigner(
    RPC_ENDPOINT,
    offlineSigner,
    { gasPrice: GasPrice.fromString(`${GAS_PRICE_STEP.average}${NATIVE_DENOM}`) }
  );

  return {
    walletId: id,
    address: accounts[0].address,
    offlineSigner,
    signingClient,
  };
}

/** Subscribe to the wallet extension's "account changed" event across all three providers. */
export function onWalletAccountChange(cb: () => void): () => void {
  window.addEventListener("keplr_keystorechange", cb);
  window.addEventListener("leap_keystorechange", cb);
  window.addEventListener("cosmostation_keystorechange", cb);
  return () => {
    window.removeEventListener("keplr_keystorechange", cb);
    window.removeEventListener("leap_keystorechange", cb);
    window.removeEventListener("cosmostation_keystorechange", cb);
  };
}
