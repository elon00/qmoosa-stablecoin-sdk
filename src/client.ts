import {
  VaultPosition,
  VaultHealth,
  CollateralConfig,
  VaultOperationResult,
  AdminActionType,
  SignedAdminIntent,
  TransactionPayload,
  ClientConfig,
  EngineAdapter
} from "./types.js";
import { signAdminIntent } from "./crypto.js";

export class StablecoinClient {
  private readonly engine: EngineAdapter;
  private readonly vaultManagerAddress: string;
  private readonly defaultDeadlineSeconds: number;
  private readonly chainId: number;
  private lastNonce: number = 0;

  constructor(
    engine: EngineAdapter,
    config: ClientConfig = {},
    chainId: number = 31337
  ) {
    this.engine = engine;
    this.vaultManagerAddress = config.vaultManagerAddress || "0xQmoosaVaultManager";
    this.defaultDeadlineSeconds = config.defaultDeadlineSeconds ?? 300;
    this.chainId = chainId;
  }

  public getVault(vaultId: string): VaultPosition | undefined {
    return this.engine.getVault(vaultId);
  }

  public getVaultHealth(vaultId: string): VaultHealth {
    return this.engine.getVaultHealth(vaultId);
  }

  public getAllVaults(): VaultPosition[] {
    return this.engine.getAllVaults();
  }

  public getCollateralConfig(token: string): CollateralConfig | undefined {
    return this.engine.getCollateralConfig(token);
  }

  public openVault(owner: string, collateralToken: string): VaultPosition {
    if (!owner || owner === "0x0000000000000000000000000000000000000000") {
      throw new Error("INVALID_OWNER_ADDRESS");
    }
    return this.engine.openVault(owner, collateralToken);
  }

  public buildDepositPayload(vaultId: string, amount: bigint): TransactionPayload {
    if (amount <= 0n) throw new RangeError("DEPOSIT_AMOUNT_MUST_BE_POSITIVE");
    return {
      to: this.vaultManagerAddress,
      method: "depositCollateral",
      params: [vaultId, amount.toString()],
      calldataEstimate: `0xdeposit_${vaultId}_${amount.toString(16)}`
    };
  }

  public buildMintPayload(vaultId: string, amount: bigint): TransactionPayload {
    if (amount <= 0n) throw new RangeError("MINT_AMOUNT_MUST_BE_POSITIVE");
    return {
      to: this.vaultManagerAddress,
      method: "mintStablecoin",
      params: [vaultId, amount.toString()],
      calldataEstimate: `0xmint_${vaultId}_${amount.toString(16)}`
    };
  }

  public buildRepayPayload(vaultId: string, amount: bigint): TransactionPayload {
    if (amount <= 0n) throw new RangeError("REPAY_AMOUNT_MUST_BE_POSITIVE");
    return {
      to: this.vaultManagerAddress,
      method: "repayDebt",
      params: [vaultId, amount.toString()],
      calldataEstimate: `0xrepay_${vaultId}_${amount.toString(16)}`
    };
  }

  public buildLiquidatePayload(vaultId: string, debtToCover: bigint): TransactionPayload {
    if (debtToCover <= 0n) throw new RangeError("DEBT_TO_COVER_MUST_BE_POSITIVE");
    return {
      to: this.vaultManagerAddress,
      method: "liquidateVault",
      params: [vaultId, debtToCover.toString()],
      calldataEstimate: `0xliquidate_${vaultId}_${debtToCover.toString(16)}`
    };
  }

  public async executeDeposit(vaultId: string, owner: string, amount: bigint): Promise<VaultOperationResult> {
    return this.engine.depositCollateral(vaultId, owner, amount);
  }

  public async executeMint(vaultId: string, owner: string, amount: bigint): Promise<VaultOperationResult> {
    return this.engine.mintStablecoin(vaultId, owner, amount);
  }

  public async executeRepay(vaultId: string, repayer: string, amount: bigint): Promise<VaultOperationResult> {
    return this.engine.repayDebt(vaultId, repayer, amount);
  }

  public async executeLiquidate(vaultId: string, liquidator: string, debtToCover: bigint): Promise<VaultOperationResult> {
    return this.engine.liquidateVault(vaultId, liquidator, debtToCover);
  }

  public signAndExecuteAdminIntent(
    action: AdminActionType,
    params: Record<string, any>,
    privateKeyPem: string,
    nonce?: number,
    deadline?: number
  ): SignedAdminIntent {
    const nextNonce = nonce !== undefined ? nonce : ++this.lastNonce;
    const expiry = deadline !== undefined ? deadline : Math.floor(Date.now() / 1000) + 3600;
    const domain = `QMOOSA:STABLECOIN_ENGINE:${this.chainId}`;

    const intent = signAdminIntent(action, params, nextNonce, expiry, domain, privateKeyPem);
    this.engine.executeAdminIntent(intent);
    return intent;
  }
}
