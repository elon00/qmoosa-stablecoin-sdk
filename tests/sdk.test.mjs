import { test } from "node:test";
import assert from "node:assert/strict";
import { StablecoinEngine } from "@qmoosa/stablecoin-engine";
import { StablecoinClient, generateKeyPair } from "../dist/index.js";

const WAD = 10n ** 18n;

function setupClient() {
  const { publicKey, privateKey } = generateKeyPair();
  const engine = new StablecoinEngine(publicKey, 31337);

  engine.registerCollateralDirect({
    token: "WETH",
    symbol: "WETH",
    decimals: 18,
    minCollateralRatioBps: 15000n, // 150%
    liquidationPenaltyBps: 1000n,  // 10%
    stabilityFeeBps: 200n,         // 2% APR
    debtCeiling: 1_000_000n * WAD,
    totalDebtIssued: 0n,
    isPaused: false
  });

  engine.setOraclePriceDirect("WETH", 3000n * WAD);

  const alice = "0xAlice1111111111111111111111111111111111";
  engine.setUserCollateralBalance(alice, "WETH", 50n * WAD);

  const bob = "0xBob2222222222222222222222222222222222";
  engine.setUserStablecoinBalance(bob, 50_000n * WAD);

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

  const health = client.getVaultHealth(vault.vaultId);
  assert.equal(health.totalDebtWad, 5_000n * WAD);
  assert.equal(health.isSolvent, true);
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
