export interface CollateralConfig {
  token: string;
  symbol: string;
  decimals: number;
  minCollateralRatioBps: bigint;
  liquidationPenaltyBps: bigint;
  stabilityFeeBps: bigint;
  debtCeiling: bigint;
  totalDebtIssued: bigint;
  isPaused: boolean;
}

export interface VaultPosition {
  vaultId: string;
  owner: string;
  collateralToken: string;
  collateralAmount: bigint;
  debtAmount: bigint;
  accruedInterest: bigint;
  lastAccrualTimestamp: number;
  updatedAt: number;
}

export interface VaultHealth {
  vaultId: string;
  collateralValueWad: bigint;
  totalDebtWad: bigint;
  collateralRatioBps: bigint;
  isSolvent: boolean;
  isLiquidatable: boolean;
  maxMintableAdditionalDebt: bigint;
}

export interface LiquidationQuote {
  vaultId: string;
  debtToRepay: bigint;
  collateralToSeize: bigint;
  penaltyCollateral: bigint;
  collateralReturnedToOwner: bigint;
}

export interface VaultOperationResult {
  txId: string;
  vaultId: string;
  operation: "OPEN" | "DEPOSIT" | "WITHDRAW" | "MINT" | "REPAY" | "LIQUIDATE";
  actor: string;
  collateralToken: string;
  collateralDelta: bigint;
  debtDelta: bigint;
  collateralRatioAfterBps: bigint;
  timestamp: number;
  success: boolean;
}

export type AdminActionType =
  | "SET_COLLATERAL_CONFIG"
  | "SET_ORACLE_PRICE"
  | "SET_PAUSED"
  | "SET_DEBT_CEILING";

export interface SignedAdminIntent {
  action: AdminActionType;
  params: Record<string, any>;
  nonce: number;
  deadline: number;
  domain: string;
  signature: string;
}

export interface TransactionPayload {
  to: string;
  method: string;
  params: any[];
  calldataEstimate: string;
}

export interface ClientConfig {
  vaultManagerAddress?: string;
  defaultDeadlineSeconds?: number;
}

export interface EngineAdapter {
  getVault(vaultId: string): VaultPosition | undefined;
  getVaultHealth(vaultId: string): VaultHealth;
  getAllVaults(): VaultPosition[];
  getCollateralConfig(token: string): CollateralConfig | undefined;
  openVault(owner: string, collateralToken: string): VaultPosition;
  depositCollateral(vaultId: string, owner: string, amount: bigint): VaultOperationResult;
  withdrawCollateral(vaultId: string, owner: string, amount: bigint): VaultOperationResult;
  mintStablecoin(vaultId: string, owner: string, amount: bigint): VaultOperationResult;
  repayDebt(vaultId: string, repayer: string, amount: bigint): VaultOperationResult;
  liquidateVault(vaultId: string, liquidator: string, debtToCover: bigint): VaultOperationResult;
  executeAdminIntent(intent: SignedAdminIntent): void;
}
