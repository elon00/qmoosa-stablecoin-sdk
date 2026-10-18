import { test } from "node:test";
import assert from "node:assert/strict";
import { StablecoinClient, generateKeyPair } from "../dist/index.js";

const WAD = 10n ** 18n;

class MockEngine {
  constructor() {
    this.vaults = new Map();
    this.collateralConfigs = new Map([
      ["WETH", {
        token: "WETH",
        symbol: "WETH",
        decimals: 18,
        minCollateralRatioBps: 15000n,
        liquidationPenaltyBps: 1000n,
        stabilityFeeBps: 200n,
        debtCeiling: 1_000_000n * WAD,
        totalDebtIssued: 0n,
        isPaused: false
      }]
    ]);
    this.adminIntents = [];
    this.counter = 0;
  }

  getVault(vaultId) {
    return this.vaults.get(vaultId);
  }

  getVaultHealth(vaultId) {
    const v = this.vaults.get(vaultId);
    return {
      vaultId,
      collateralValueWad: v ? v.collateralAmount * 3000n : 0n,
      totalDebtWad: v ? v.debtAmount : 0n,
      collateralRatioBps: v && v.debtAmount > 0n ? (v.collateralAmount * 3000n * 10000n) / v.debtAmount : 30000n,
      isSolvent: true,
      isLiquidatable: false,
      maxMintableAdditionalDebt: 10000n * WAD
    };
  }

  getAllVaults() {
    return Array.from(this.vaults.values());
  }

  getCollateralConfig(token) {
    return this.collateralConfigs.get(token);
  }

  openVault(owner, collateralToken) {
    this.counter++;
    const vaultId = `vault_${this.counter}`;
    const vault = {
      vaultId,
      owner,
      collateralToken,
      collateralAmount: 0n,
      debtAmount: 0n,
      accruedInterest: 0n,
      lastAccrualTimestamp: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000)
    };
    this.vaults.set(vaultId, vault);
    return vault;
  }

  depositCollateral(vaultId, owner, amount) {
    const v = this.vaults.get(vaultId);
    v.collateralAmount += amount;
    return {
      txId: "tx_mock_dep",
      vaultId,
      operation: "DEPOSIT",
      actor: owner,
      collateralToken: v.collateralToken,
      collateralDelta: amount,
      debtDelta: 0n,
      collateralRatioAfterBps: 30000n,
      timestamp: Date.now(),
      success: true
    };
  }

  withdrawCollateral(vaultId, owner, amount) {
    const v = this.vaults.get(vaultId);
    v.collateralAmount -= amount;
    return {
      txId: "tx_mock_wth",
      vaultId,
      operation: "WITHDRAW",
      actor: owner,
      collateralToken: v.collateralToken,
      collateralDelta: -amount,
      debtDelta: 0n,
      collateralRatioAfterBps: 20000n,
      timestamp: Date.now(),
      success: true
    };
  }

  mintStablecoin(vaultId, owner, amount) {
    const v = this.vaults.get(vaultId);
    v.debtAmount += amount;
    return {
      txId: "tx_mock_mnt",
      vaultId,
      operation: "MINT",
      actor: owner,
      collateralToken: v.collateralToken,
      collateralDelta: 0n,
      debtDelta: amount,
      collateralRatioAfterBps: 25000n,
      timestamp: Date.now(),
      success: true
    };
  }

  repayDebt(vaultId, repayer, amount) {
    const v = this.vaults.get(vaultId);
    v.debtAmount -= amount;
    return {
      txId: "tx_mock_rpy",
      vaultId,
      operation: "REPAY",
      actor: repayer,
      collateralToken: v.collateralToken,
      collateralDelta: 0n,
      debtDelta: -amount,
      collateralRatioAfterBps: 30000n,
      timestamp: Date.now(),
      success: true
    };
  }

  liquidateVault(vaultId, liquidator, debtToCover) {
    const v = this.vaults.get(vaultId);
    v.debtAmount -= debtToCover;
    return {
      txId: "tx_mock_liq",
      vaultId,
      operation: "LIQUIDATE",
      actor: liquidator,
      collateralToken: v.collateralToken,
      collateralDelta: -((debtToCover * 11n) / 10n) / 3000n,
      debtDelta: -debtToCover,
      collateralRatioAfterBps: 15000n,
      timestamp: Date.now(),
      success: true
    };
  }

  executeAdminIntent(intent) {
    this.adminIntents.push(intent);
  }
}

function setupClient() {
  const { publicKey, privateKey } = generateKeyPair();
  const engine = new MockEngine();

  const alice = "0xAlice1111111111111111111111111111111111";
  const bob = "0xBob2222222222222222222222222222222222";

  const client = new StablecoinClient(engine, {
    vaultManagerAddress: "0xQmoosaVaultManagerV1",
    defaultDeadlineSeconds: 600
  });

  return { client, engine, publicKey, privateKey, alice, bob };
}

test("1. StablecoinClient vault opening and health queries", () => {
  const { client, alice } = setupClient();
  const vault = client.openVault(alice, "WETH");

  assert.equal(vault.owner, alice);
  assert.equal(vault.collateralToken, "WETH");

  const fetched = client.getVault(vault.vaultId);
  assert.ok(fetched);
  assert.equal(fetched.vaultId, vault.vaultId);

  const health = client.getVaultHealth(vault.vaultId);
  assert.equal(health.isSolvent, true);
  assert.equal(health.totalDebtWad, 0n);
});

test("2. Transaction payload builders format correct contract calldata", () => {
  const { client } = setupClient();

  const depPayload = client.buildDepositPayload("vault_1", 10n * WAD);
  assert.equal(depPayload.to, "0xQmoosaVaultManagerV1");
  assert.equal(depPayload.method, "depositCollateral");
  assert.ok(depPayload.calldataEstimate.startsWith("0xdeposit_vault_1_"));

  const mintPayload = client.buildMintPayload("vault_1", 5000n * WAD);
  assert.equal(mintPayload.method, "mintStablecoin");
  assert.ok(mintPayload.calldataEstimate.startsWith("0xmint_vault_1_"));

  const liqPayload = client.buildLiquidatePayload("vault_1", 2000n * WAD);
  assert.equal(liqPayload.method, "liquidateVault");
  assert.ok(liqPayload.calldataEstimate.startsWith("0xliquidate_vault_1_"));
});

test("3. Invalid owner address fails closed", () => {
  const { client } = setupClient();

  assert.throws(
    () => client.openVault("", "WETH"),
    /INVALID_OWNER_ADDRESS/
  );
  assert.throws(
    () => client.openVault("0x0000000000000000000000000000000000000000", "WETH"),
    /INVALID_OWNER_ADDRESS/
  );
});

test("4. End-to-end CDP lifecycle execution via client", async () => {
  const { client, alice } = setupClient();

  const vault = client.openVault(alice, "WETH");

  // Deposit 10 WETH
  const dep = await client.executeDeposit(vault.vaultId, alice, 10n * WAD);
  assert.equal(dep.success, true);
  assert.equal(dep.operation, "DEPOSIT");

  // Mint 10,000 QUSD
  const mint = await client.executeMint(vault.vaultId, alice, 10_000n * WAD);
  assert.equal(mint.success, true);
  assert.equal(mint.operation, "MINT");

  // Repay 5,000 QUSD
  const repay = await client.executeRepay(vault.vaultId, alice, 5_000n * WAD);
  assert.equal(repay.success, true);
  assert.equal(repay.operation, "REPAY");

  const v = client.getVault(vault.vaultId);
  assert.equal(v.debtAmount, 5_000n * WAD);
});

test("5. Admin intent signing and execution via SDK client", () => {
  const { client, privateKey } = setupClient();

  const intent = client.signAndExecuteAdminIntent(
    "SET_ORACLE_PRICE",
    { token: "WETH", priceWad: 3500n * WAD },
    privateKey
  );

  assert.equal(intent.action, "SET_ORACLE_PRICE");
  assert.equal(intent.domain, "QMOOSA:STABLECOIN_ENGINE:31337");
});
